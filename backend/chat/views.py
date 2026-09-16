from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
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

        # Enforce 10 MB max file size per attachment
        MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
        for f in files:
            if f.size > MAX_FILE_SIZE_BYTES:
                size_mb = round(f.size / (1024 * 1024), 2)
                return Response(
                    {
                        "error": f"File '{f.name}' ({size_mb} MB) exceeds the maximum allowed file size of 10 MB. Please upload files under 10 MB."
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Auto detect type if files attached
        if files and message_type == Message.MessageType.TEXT:
            first_file = files[0]
            if first_file.content_type.startswith('image/'):
                message_type = Message.MessageType.IMAGE
            elif first_file.content_type.startswith('video/'):
                message_type = Message.MessageType.VIDEO
            else:
                message_type = Message.MessageType.FILE

        reply_to_id = request.data.get('reply_to') or request.data.get('reply_to_id')
        reply_to_msg = None
        if reply_to_id:
            reply_to_msg = Message.objects.filter(id=reply_to_id, conversation=conversation).first()

        message = Message.objects.create(
            conversation=conversation,
            sender=request.user,
            reply_to=reply_to_msg,
            content=content,
            message_type=message_type
        )

        for f in files:
            Attachment.objects.create(
                message=message,
                file=f,
                file_type=f.content_type,
                file_size=f.size
            )

        conversation.save()  # Triggers auto_now for updated_at

        # Also update sender's last_read_message
        member = conversation.members.filter(user=request.user).first()
        if member:
            member.last_read_message = message
            member.save(update_fields=['last_read_message'])

        msg_data = MessageSerializer(message, context={'request': request}).data

        # Broadcast via Channel Layer to room group safely
        try:
            channel_layer = get_channel_layer()
            if channel_layer:
                from django.core.serializers.json import DjangoJSONEncoder
                import json
                clean_msg_data = json.loads(json.dumps(msg_data, cls=DjangoJSONEncoder))
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

        return Response(msg_data, status=status.HTTP_201_CREATED)

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

    def get_queryset(self):
        user = self.request.user
        org = get_user_organization(user)

        # Strict multi-tenant isolation: If user is not associated with an organization, return none
        if not org:
            return User.objects.none()

        # Get all active employee emails strictly within the user's organization
        org_employee_emails = Employee.objects.filter(
            organization=org,
            status='ACTIVE'
        ).values_list('email', flat=True)

        # Base queryset: Active employees in the same organization, excluding self and superadmins/admins
        queryset = User.objects.filter(
            is_active=True,
            email__in=org_employee_emails
        ).exclude(
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
