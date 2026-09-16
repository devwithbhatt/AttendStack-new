import json
from django.core.serializers.json import DjangoJSONEncoder
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import Conversation, ConversationMember


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.conversation_id = self.scope['url_route']['kwargs']['conversation_id']
        self.room_group_name = f'chat_{self.conversation_id}'
        self.user = self.scope.get('user')

        if not self.user or not self.user.is_authenticated:
            await self.close(code=4001)
            return

        is_member = await self.check_membership(self.conversation_id, self.user.id)
        if not is_member:
            await self.close(code=4003)
            return

        # Accept WebSocket connection first to complete handshake safely
        await self.accept()

        # Join room group safely
        try:
            if self.channel_layer:
                await self.channel_layer.group_add(
                    self.room_group_name,
                    self.channel_name
                )
        except Exception as e:
            import logging
            logging.warning(f"Failed to add to channel group {self.room_group_name}: {e}")

    async def disconnect(self, close_code):
        if hasattr(self, 'room_group_name'):
            try:
                if self.channel_layer:
                    await self.channel_layer.group_discard(
                        self.room_group_name,
                        self.channel_name
                    )
            except Exception:
                pass

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            action = data.get('action')

            if action == 'typing':
                is_typing = data.get('is_typing', False)
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'chat.typing',
                        'user_id': str(self.user.id),
                        'username': getattr(self.user, 'get_full_name', lambda: '')() or self.user.email,
                        'is_typing': is_typing
                    }
                )
        except Exception:
            pass

    async def chat_message(self, event):
        message = event['message']
        await self.send(text_data=json.dumps({
            'type': 'new_message',
            'message': message
        }, cls=DjangoJSONEncoder))

    async def chat_message_deleted(self, event):
        await self.send(text_data=json.dumps({
            'type': 'message_deleted',
            'message_id': event['message_id'],
            'conversation_id': event.get('conversation_id')
        }, cls=DjangoJSONEncoder))

    async def chat_message_reaction(self, event):
        await self.send(text_data=json.dumps({
            'type': 'message_reaction',
            'message_id': event['message_id'],
            'reactions': event.get('reactions', []),
            'conversation_id': event.get('conversation_id')
        }, cls=DjangoJSONEncoder))

    async def chat_typing(self, event):
        # Don't send back to the user who is typing
        if str(event['user_id']) != str(self.user.id):
            await self.send(text_data=json.dumps({
                'type': 'typing',
                'user_id': event['user_id'],
                'username': event['username'],
                'is_typing': event['is_typing']
            }, cls=DjangoJSONEncoder))

    @database_sync_to_async
    def check_membership(self, conversation_id, user_id):
        return ConversationMember.objects.filter(
            conversation_id=conversation_id,
            user_id=user_id
        ).exists()
