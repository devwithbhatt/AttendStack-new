from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ConversationViewSet, ChatUserViewSet, chat_heartbeat

router = DefaultRouter()
router.register(r'conversations', ConversationViewSet, basename='conversation')
router.register(r'users', ChatUserViewSet, basename='chat-user')

urlpatterns = [
    path('presence/heartbeat/', chat_heartbeat, name='chat-heartbeat'),
    path('', include(router.urls)),
]
