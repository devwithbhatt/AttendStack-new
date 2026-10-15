from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action, api_view, permission_classes as perm_classes_dec
from rest_framework.response import Response
from django.utils import timezone as tz
from rest_framework.pagination import PageNumberPagination
from django.contrib.auth import get_user_model
from django.db.models import Q, Count
from django.shortcuts import get_object_or_404
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from employees.models import Employee
from organizations.models import Organization
from .models import Conversation, ConversationMember, Message, Attachment, MessageReaction
from .serializers import (
    ConversationSerializer,
    MessageSerializer,
    CreateDirectConversationSerializer,
    CreateGroupConversationSerializer,
    UserMinimalSerializer,
    AttachmentSerializer
)

User = get_user_model()


def get_user_organization(user):
    """
    Industry-ready multi-tenant helper:
    Resolves the exact Organization instance associated with a given User.
    """
    from organizations.services import get_organization_for_user
    return get_organization_for_user(user)


class MessagePagination(PageNumberPagination):
    page_size = 30
    page_size_query_param = 'page_size'
    max_page_size = 100


class ConversationViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ConversationSerializer

    def get_queryset(self):
        return Conversation.objects.filter(
            members__user=self.request.user
        ).distinct().order_by('-updated_at')

    def _is_group_manager(self, user, conversation):
        """
        True if `user` can manage (rename / add members / remove members /
        delete) a GROUP conversation: either a group-level ADMIN for that
        specific conversation, or a company-level administrator (matching
        the same check already used to gate group creation/announcements).
        """
        if conversation.type != Conversation.ConversationType.GROUP:
            return False
        is_group_admin = conversation.members.filter(
            user=user, role=ConversationMember.Role.ADMIN
        ).exists()
        user_role = getattr(user, 'role', '')
        is_company_admin = user_role in ['SUPER_ADMIN', 'HR'] or user.is_staff or user.is_superuser
        return is_group_admin or is_company_admin

    def _broadcast_conversation_update(self, conversation, request):
        conv_data = ConversationSerializer(conversation, context={'request': request}).data
        try:
            channel_layer = get_channel_layer()
            if channel_layer:
                from django.core.serializers.json import DjangoJSONEncoder
                import json
                clean_data = json.loads(json.dumps(conv_data, cls=DjangoJSONEncoder))
                async_to_sync(channel_layer.group_send)(
                    f"chat_{conversation.id}",
                    {
                        "type": "chat.conversation_updated",
                        "conversation": clean_data
                    }
                )
        except Exception as e:
            import logging
            logging.warning(f"Failed to broadcast WS conversation update: {e}")

    def update(self, request, *args, **kwargs):
        return Response(
            {"error": "Use the rename-group endpoint to rename a conversation."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        conversation = self.get_object()
        if conversation.type == Conversation.ConversationType.GROUP and not self._is_group_manager(request.user, conversation):
            return Response(
                {"error": "Only group admins or company administrators can delete this group."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='rename-group')
    def rename_group(self, request, pk=None):
        conversation = self.get_object()
        if conversation.type != Conversation.ConversationType.GROUP:
            return Response({"error": "Only group conversations can be renamed."}, status=status.HTTP_400_BAD_REQUEST)
        if not self._is_group_manager(request.user, conversation):
            return Response(
                {"error": "Only group admins or company administrators can rename this group."},
                status=status.HTTP_403_FORBIDDEN,
            )

        name = (request.data.get('name') or '').strip()
        if not name:
            return Response({"error": "Group name is required."}, status=status.HTTP_400_BAD_REQUEST)
        if len(name) > 255:
            return Response({"error": "Group name must be 255 characters or fewer."}, status=status.HTTP_400_BAD_REQUEST)

        conversation.name = name
        conversation.save(update_fields=['name', 'updated_at'])

        self._broadcast_conversation_update(conversation, request)
        return Response(ConversationSerializer(conversation, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='add-members')
    def add_members(self, request, pk=None):
        conversation = self.get_object()
        if conversation.type != Conversation.ConversationType.GROUP:
            return Response({"error": "Members can only be added to group conversations."}, status=status.HTTP_400_BAD_REQUEST)
        if not self._is_group_manager(request.user, conversation):
            return Response(
                {"error": "Only group admins or company administrators can add members."},
                status=status.HTTP_403_FORBIDDEN,
            )

        raw_member_ids = (
            request.data.getlist('member_ids')
            if hasattr(request.data, 'getlist')
            else request.data.get('member_ids')
        )
        member_ids = list(set(raw_member_ids or []))
        if not member_ids:
            return Response({"error": "member_ids is required."}, status=status.HTTP_400_BAD_REQUEST)

        org = get_user_organization(request.user)
        if not org:
            return Response({"error": "Organization not found for your account."}, status=status.HTTP_400_BAD_REQUEST)

        existing_ids = set(str(uid) for uid in conversation.members.values_list('user_id', flat=True))
        users = User.objects.filter(id__in=member_ids, is_active=True)

        added_any = False
        for u in users:
            if str(u.id) in existing_ids:
                continue
            u_org = get_user_organization(u)
            if not u_org or u_org.id != org.id:
                return Response(
                    {"error": f"{u.email} does not belong to your organization."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            ConversationMember.objects.create(conversation=conversation, user=u, role=ConversationMember.Role.MEMBER)
            added_any = True

        if added_any:
            conversation.save(update_fields=['updated_at'])
            self._broadcast_conversation_update(conversation, request)

        return Response(ConversationSerializer(conversation, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='remove-member')
    def remove_member(self, request, pk=None):
        conversation = self.get_object()
        if conversation.type != Conversation.ConversationType.GROUP:
            return Response({"error": "Members can only be removed from group conversations."}, status=status.HTTP_400_BAD_REQUEST)

        target_user_id = request.data.get('user_id')
        if not target_user_id:
            return Response({"error": "user_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        is_self_removal = str(target_user_id) == str(request.user.id)
        if not is_self_removal and not self._is_group_manager(request.user, conversation):
            return Response(
                {"error": "Only group admins or company administrators can remove other members."},
                status=status.HTTP_403_FORBIDDEN,
            )

        member = conversation.members.filter(user_id=target_user_id).first()
        if not member:
            return Response({"error": "This user is not a member of the group."}, status=status.HTTP_404_NOT_FOUND)

        if member.role == ConversationMember.Role.ADMIN:
            other_admins_exist = conversation.members.filter(
                role=ConversationMember.Role.ADMIN
            ).exclude(id=member.id).exists()
            if not other_admins_exist:
                return Response(
                    {"error": "Cannot remove the only group admin. Promote another member to admin first."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        member.delete()
        conversation.save(update_fields=['updated_at'])
        self._broadcast_conversation_update(conversation, request)

        return Response(ConversationSerializer(conversation, context={'request': request}).data)

    @action(detail=False, methods=['post'], url_path='direct')
    def create_direct(self, request):
        serializer = CreateDirectConversationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target_user_id = serializer.validated_data['target_user_id']

        if str(target_user_id) == str(request.user.id):
            return Response(
                {"error": "You cannot start a direct chat with yourself."},
                status=status.HTTP_400_BAD_REQUEST
            )

        target_user = get_object_or_404(User, id=target_user_id)

        # Multi-tenant isolation: enforce same organization
        sender_org = get_user_organization(request.user)
        target_org = get_user_organization(target_user)

        if not sender_org or not target_org or sender_org.id != target_org.id:
            return Response(
                {"error": "Cross-organization direct messaging is not allowed. You can only chat with members in your organization."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Enforce active user & employee status check via Employee model lookup by email
        emp = Employee.objects.filter(email__iexact=target_user.email, organization=sender_org).first()
        if not target_user.is_active or (emp and emp.status in ['INACTIVE', 'TERMINATED']):
            return Response(
                {"error": "You can only start a chat with active team members in your organization."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if direct conversation already exists between these 2 users
        existing_conv = Conversation.objects.filter(
            type=Conversation.ConversationType.DIRECT,
            members__user=request.user
        ).filter(
            members__user=target_user
        ).first()

        if existing_conv:
            return Response(
                ConversationSerializer(existing_conv, context={'request': request}).data,
                status=status.HTTP_200_OK
            )

        # Create new direct conversation
        conv = Conversation.objects.create(type=Conversation.ConversationType.DIRECT)
        ConversationMember.objects.create(conversation=conv, user=request.user)
        ConversationMember.objects.create(conversation=conv, user=target_user)

        return Response(
            ConversationSerializer(conv, context={'request': request}).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=['post'], url_path='group')
    def create_group(self, request):
        # Only Admins and HR Managers are authorized to create group chats
        user_role = getattr(request.user, 'role', '')
        is_admin_or_hr = user_role in ['SUPER_ADMIN', 'HR'] or request.user.is_staff or request.user.is_superuser
        if not is_admin_or_hr:
            return Response(
                {"error": "Only Administrators and HR Managers are authorized to create group chats."},
                status=status.HTTP_403_FORBIDDEN
            )

        creator_org = get_user_organization(request.user)
        if not creator_org:
            return Response(
                {"error": "Organization not found for your account."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = CreateGroupConversationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        name = serializer.validated_data['name']
        member_ids = list(set(serializer.validated_data['member_ids']))

        if str(request.user.id) not in [str(mid) for mid in member_ids]:
            member_ids.append(request.user.id)

        users = list(User.objects.filter(id__in=member_ids, is_active=True))

        # Enforce all group members strictly belong to the creator's organization
        for u in users:
            u_org = get_user_organization(u)
            if not u_org or u_org.id != creator_org.id:
                return Response(
                    {"error": f"Member {u.email} does not belong to your organization."},
                    status=status.HTTP_400_BAD_REQUEST
                )

        conv = Conversation.objects.create(
            type=Conversation.ConversationType.GROUP,
            name=name
        )

        for u in users:
            role = ConversationMember.Role.ADMIN if u.id == request.user.id else ConversationMember.Role.MEMBER
            ConversationMember.objects.create(conversation=conv, user=u, role=role)

        return Response(
            ConversationSerializer(conv, context={'request': request}).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['get'], url_path='messages')
    def get_messages(self, request, pk=None):
        conversation = self.get_object()
        messages = conversation.messages.filter(is_deleted=False).order_by('-created_at')
        
        paginator = MessagePagination()
        page = paginator.paginate_queryset(messages, request)
        if page is not None:
            serializer = MessageSerializer(page, many=True, context={'request': request})
            return paginator.get_paginated_response(serializer.data)

        serializer = MessageSerializer(messages, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='send-message')
    def send_message(self, request, pk=None):
        conversation = self.get_object()
        content = request.data.get('content', '')
        message_type = request.data.get('message_type', Message.MessageType.TEXT)
        files = request.FILES.getlist('files')

        if not content and not files:
            return Response(
                {"error": "Message content or attachment is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
        for f in files:
            if f.size > MAX_FILE_SIZE_BYTES:
                size_mb = round(f.size / (1024 * 1024), 2)
                return Response(
                    {
                        "error": f"File '{f.name}' ({size_mb} MB) exceeds the maximum allowed file size of 50 MB. Please upload files under 50 MB."
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )

        reply_to_id = request.data.get('reply_to') or request.data.get('reply_to_id')
        reply_to_msg = None
        if reply_to_id:
            reply_to_msg = Message.objects.filter(id=reply_to_id, conversation=conversation).first()

        created_messages = []

        if files and len(files) > 1 and not content:
            for f in files:
                if f.content_type.startswith('image/'):
                    ft = Message.MessageType.IMAGE
                elif f.content_type.startswith('video/'):
                    ft = Message.MessageType.VIDEO
                else:
                    ft = Message.MessageType.FILE

                msg = Message.objects.create(
                    conversation=conversation,
                    sender=request.user,
                    reply_to=reply_to_msg,
                    content='',
                    message_type=ft
                )
                Attachment.objects.create(
                    message=msg,
                    file=f,
                    file_type=f.content_type,
                    file_size=f.size
                )
                created_messages.append(msg)
                reply_to_msg = None
        else:
            if files and message_type == Message.MessageType.TEXT:
                first_file = files[0]
                if first_file.content_type.startswith('image/'):
                    message_type = Message.MessageType.IMAGE
                elif first_file.content_type.startswith('video/'):
                    message_type = Message.MessageType.VIDEO
                else:
                    message_type = Message.MessageType.FILE

            msg = Message.objects.create(
                conversation=conversation,
                sender=request.user,
                reply_to=reply_to_msg,
                content=content,
                message_type=message_type
            )

            for f in files:
                Attachment.objects.create(
                    message=msg,
                    file=f,
                    file_type=f.content_type,
                    file_size=f.size
                )
            created_messages.append(msg)

        conversation.save()

        last_msg = created_messages[-1]
        member = conversation.members.filter(user=request.user).first()
        if member:
            member.last_read_message = last_msg
            member.save(update_fields=['last_read_message'])

        all_msg_data = [
            MessageSerializer(m, context={'request': request}).data
            for m in created_messages
        ]

        try:
            channel_layer = get_channel_layer()
            if channel_layer:
                from django.core.serializers.json import DjangoJSONEncoder
                import json
                for md in all_msg_data:
                    clean_msg_data = json.loads(json.dumps(md, cls=DjangoJSONEncoder))
                    async_to_sync(channel_layer.group_send)(
                        f"chat_{conversation.id}",
                        {
                            "type": "chat.message",
                            "message": clean_msg_data
                        }
                    )
        except Exception as e:
            import logging
            logging.warning(f"Failed to broadcast WS message: {e}")

        if len(all_msg_data) == 1:
            return Response(all_msg_data[0], status=status.HTTP_201_CREATED)
        return Response(all_msg_data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post', 'delete'], url_path='delete-message')
    def delete_message(self, request, pk=None):
        conversation = self.get_object()
        message_id = request.data.get('message_id') or request.query_params.get('message_id')
        if not message_id:
            return Response(
                {"error": "message_id is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        message = get_object_or_404(Message, id=message_id, conversation=conversation)

        is_sender = (message.sender == request.user)
        is_admin = conversation.members.filter(
            user=request.user,
            role=ConversationMember.Role.ADMIN
        ).exists()

        if not (is_sender or is_admin):
            return Response(
                {"error": "You do not have permission to delete this message."},
                status=status.HTTP_403_FORBIDDEN
            )

        message.is_deleted = True
        message.content = "This message was deleted"
        message.save()

        # Delete physical files from storage disk before removing database attachment entries
        attachments = list(message.attachments.all())
        for attachment in attachments:
            if attachment.file:
                try:
                    attachment.file.delete(save=False)
                except Exception as e:
                    import logging
                    logging.warning(f"Failed to delete storage file for attachment {attachment.id}: {e}")
            attachment.delete()

        msg_data = MessageSerializer(message, context={'request': request}).data

        try:
            channel_layer = get_channel_layer()
            if channel_layer:
                from django.core.serializers.json import DjangoJSONEncoder
                import json
                async_to_sync(channel_layer.group_send)(
                    f"chat_{conversation.id}",
                    {
                        "type": "chat.message_deleted",
                        "message_id": str(message.id),
                        "conversation_id": str(conversation.id)
                    }
                )
        except Exception as e:
            import logging
            logging.warning(f"Failed to broadcast WS message deletion: {e}")

        return Response(msg_data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='read')
    def mark_read(self, request, pk=None):
        conversation = self.get_object()
        latest_message = conversation.messages.filter(is_deleted=False).order_by('-created_at').first()
        if latest_message:
            member = conversation.members.filter(user=request.user).first()
            if member:
                member.last_read_message = latest_message
                member.save(update_fields=['last_read_message'])
        return Response({"status": "read marked"}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='clear')
    def clear_chat(self, request, pk=None):
        conversation = self.get_object()
        messages = conversation.messages.all()
        for msg in messages:
            msg.is_deleted = True
            msg.content = "This message was cleared"
            msg.save()
            for attachment in list(msg.attachments.all()):
                if attachment.file:
                    try:
                        attachment.file.delete(save=False)
                    except Exception:
                        pass
                attachment.delete()
        return Response({"status": "Chat cleared successfully"}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='react')
    def react_message(self, request, pk=None):
        conversation = self.get_object()
        message_id = request.data.get('message_id')
        emoji = (request.data.get('emoji') or '').strip()

        if not message_id or not emoji:
            return Response(
                {"error": "message_id and emoji are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        message = get_object_or_404(Message, id=message_id, conversation=conversation)

        # Enforce 1 reaction per user per message (WhatsApp/iMessage style)
        # If user clicks the same emoji they previously selected -> remove it (toggle off)
        # If user clicks a different emoji -> swap/replace their previous reaction with the new emoji
        user_reactions = MessageReaction.objects.filter(
            message=message,
            user=request.user
        )
        existing_reaction = user_reactions.first()

        if existing_reaction:
            if existing_reaction.emoji == emoji:
                # Same emoji: remove reaction
                user_reactions.delete()
            else:
                # Different emoji: delete any other reactions and set the new emoji
                user_reactions.exclude(id=existing_reaction.id).delete()
                existing_reaction.emoji = emoji
                existing_reaction.save()
        else:
            MessageReaction.objects.create(
                message=message,
                user=request.user,
                emoji=emoji
            )

        msg_data = MessageSerializer(message, context={'request': request}).data

        # Broadcast reaction update via WebSockets to all participants in real time
        try:
            channel_layer = get_channel_layer()
            if channel_layer:
                async_to_sync(channel_layer.group_send)(
                    f"chat_{conversation.id}",
                    {
                        "type": "chat.message_reaction",
                        "message_id": str(message.id),
                        "reactions": msg_data.get('reactions', []),
                        "conversation_id": str(conversation.id)
                    }
                )
        except Exception as e:
            import logging
            logging.warning(f"Failed to broadcast WS reaction: {e}")

        return Response(msg_data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='announcement')
    def send_announcement(self, request):
        user_role = getattr(request.user, 'role', '')
        is_admin_or_hr = user_role in ['SUPER_ADMIN', 'HR'] or request.user.is_staff or request.user.is_superuser
        if not is_admin_or_hr:
            return Response(
                {"error": "Only Administrators and HR Managers are authorized to send announcements."},
                status=status.HTTP_403_FORBIDDEN
            )

        creator_org = get_user_organization(request.user)
        if not creator_org:
            return Response(
                {"error": "Organization not found for your account."},
                status=status.HTTP_400_BAD_REQUEST
            )

        content = request.data.get('content', '')
        target_type = request.data.get('target_type', 'EVERYONE')
        department_target = request.data.get('department_target', '')
        pinned = request.data.get('pinned', True)
        requires_ack = request.data.get('requires_acknowledgement', False)

        announcement_group_name = f"{creator_org.name} Announcements"

        # Find existing announcement conversation where request.user is a member and name matches
        conv = Conversation.objects.filter(
            type=Conversation.ConversationType.GROUP,
            name__in=[announcement_group_name, "Company Announcements", "\U0001f4e2 Company Announcements"],
            members__user=request.user
        ).first()

        if not conv:
            conv = Conversation.objects.create(
                type=Conversation.ConversationType.GROUP,
                name=announcement_group_name
            )
            ConversationMember.objects.create(
                conversation=conv,
                user=request.user,
                role=ConversationMember.Role.ADMIN
            )
        else:
            if conv.name != announcement_group_name:
                conv.name = announcement_group_name
                conv.save(update_fields=["name"])

        # Add all active employees belonging STRICTLY to this organization
        org_emails = Employee.objects.filter(
            organization=creator_org,
            status='ACTIVE'
        ).values_list('email', flat=True)

        active_org_users = User.objects.filter(
            is_active=True,
            email__in=org_emails
        ).exclude(id=request.user.id)

        existing_member_user_ids = set(conv.members.values_list('user_id', flat=True))
        for u in active_org_users:
            if u.id not in existing_member_user_ids:
                ConversationMember.objects.create(conversation=conv, user=u)

        message = Message.objects.create(
            conversation=conv,
            sender=request.user,
            content=content,
            message_type=Message.MessageType.TEXT,
            is_announcement=True,
            pinned=pinned,
            target_type=target_type,
            department_target=department_target,
            requires_acknowledgement=requires_ack
        )
        conv.save()
        msg_data = MessageSerializer(message, context={'request': request}).data
        return Response(msg_data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='acknowledge')
    def acknowledge_announcement(self, request, pk=None):
        message = get_object_or_404(Message, id=pk)
        message.acknowledged_by.add(request.user)
        return Response({"status": "acknowledged"}, status=status.HTTP_200_OK)


class ChatUserViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Search and list users for starting direct chats or adding group members.
    Strictly isolated to the authenticated user's organization.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = UserMinimalSerializer

    def _include_inactive(self):
        # "New Chat" directory: everyone in the company, active or not.
        return self.request.query_params.get('include_inactive') in ('1', 'true', 'True')

    def paginate_queryset(self, queryset):
        # The directory is one company's staff — return it whole.
        if self._include_inactive():
            return None
        return super().paginate_queryset(queryset)

    def get_queryset(self):
        user = self.request.user
        org = get_user_organization(user)

        # Strict multi-tenant isolation: If user is not associated with an organization, return none
        if not org:
            return User.objects.none()

        include_inactive = self._include_inactive()

        # Employee emails strictly within the user's organization (active only,
        # unless the full directory was asked for)
        org_employees = Employee.objects.filter(organization=org)
        if not include_inactive:
            org_employees = org_employees.filter(status='ACTIVE')
        else:
            # Terminated staff can't access ZuperHR at all, so they're
            # left out of the directory entirely; Inactive ones stay listed.
            org_employees = org_employees.exclude(status='TERMINATED')
        org_employee_emails = org_employees.values_list('email', flat=True)

        # Base queryset: employees in the same organization, excluding self and superadmins/admins
        queryset = User.objects.filter(email__in=org_employee_emails)
        if not include_inactive:
            queryset = queryset.filter(is_active=True)
        queryset = queryset.exclude(
            id=user.id
        ).exclude(
            role='SUPER_ADMIN'
        ).exclude(
            is_superuser=True
        )

        search = self.request.query_params.get('search', '').strip()
        if search:
            queryset = queryset.filter(
                Q(email__icontains=search) |
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(employee_id__icontains=search)
            )
        return queryset.order_by('first_name', 'last_name', 'email')


@api_view(['POST'])
@perm_classes_dec([permissions.IsAuthenticated])
def chat_heartbeat(request):
    User.objects.filter(pk=request.user.pk).update(chat_last_seen_at=tz.now())
    return Response({"ok": True})
