from urllib.parse import parse_qs
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken

User = get_user_model()


@database_sync_to_async
def get_user_from_token(token_key):
    try:
        token_key = (token_key or '').strip()
        if not token_key:
            return AnonymousUser()
        access_token = AccessToken(token_key)
        user_id = access_token.get('user_id')
        if not user_id:
            return AnonymousUser()
        user = User.objects.filter(id=user_id, is_active=True).first()
        return user if user else AnonymousUser()
    except Exception:
        return AnonymousUser()


class JWTAuthMiddleware:
    """
    Custom Middleware for Django Channels WebSockets to authenticate via JWT token.
    Token can be passed in Query String (ws://...?token=<token>) or Headers.
    """

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        try:
            query_string = scope.get('query_string', b'').decode('utf-8')
            query_params = parse_qs(query_string)
            token = query_params.get('token', [None])[0]

            if not token:
                # Check headers
                headers = dict(scope.get('headers', []))
                if b'authorization' in headers:
                    auth_header = headers[b'authorization'].decode('utf-8')
                    if auth_header.startswith('Bearer '):
                        token = auth_header.split(' ')[1]

            if token:
                scope['user'] = await get_user_from_token(token)
            else:
                scope['user'] = AnonymousUser()
        except Exception as e:
            import logging
            logging.error(f"JWTAuthMiddleware error: {e}")
            scope['user'] = AnonymousUser()

        return await self.inner(scope, receive, send)
