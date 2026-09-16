import uuid
from django.db import models
from django.conf import settings


class Conversation(models.Model):
    class ConversationType(models.TextChoices):
        DIRECT = 'DIRECT', 'Direct'
        GROUP = 'GROUP', 'Group'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    type = models.CharField(
        max_length=10,
        choices=ConversationType.choices,
        default=ConversationType.DIRECT
    )
    name = models.CharField(max_length=255, blank=True, null=True)
    avatar = models.ImageField(upload_to='chat_avatars/', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f"{self.type} - {self.name or str(self.id)}"


class ConversationMember(models.Model):
    class Role(models.TextChoices):
        ADMIN = 'ADMIN', 'Admin'
        MEMBER = 'MEMBER', 'Member'

    id = models.BigAutoField(primary_key=True)
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name='members'
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='chat_memberships'
    )
    role = models.CharField(
        max_length=10,
        choices=Role.choices,
        default=Role.MEMBER
    )
    joined_at = models.DateTimeField(auto_now_add=True)
    last_read_message = models.ForeignKey(
        'Message',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+'
    )

    class Meta:
        unique_together = ('conversation', 'user')

    def __str__(self):
        return f"{self.user} in {self.conversation.id}"


class Message(models.Model):
    class MessageType(models.TextChoices):
        TEXT = 'TEXT', 'Text'
        IMAGE = 'IMAGE', 'Image'
        VIDEO = 'VIDEO', 'Video'
        FILE = 'FILE', 'File'
        STICKER = 'STICKER', 'Sticker'
        SYSTEM = 'SYSTEM', 'System'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name='messages'
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sent_chat_messages'
    )
    reply_to = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='replies'
    )
    content = models.TextField(blank=True, null=True)
    message_type = models.CharField(
        max_length=10,
        choices=MessageType.choices,
        default=MessageType.TEXT
    )
    is_edited = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)
    is_announcement = models.BooleanField(default=False)
    pinned = models.BooleanField(default=False)
    target_type = models.CharField(max_length=20, default='EVERYONE')
    department_target = models.CharField(max_length=100, blank=True, null=True)
    requires_acknowledgement = models.BooleanField(default=False)
    acknowledged_by = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name='acknowledged_announcements'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['conversation', 'created_at']),
        ]

    def __str__(self):
        return f"Msg from {self.sender} in {self.conversation_id} at {self.created_at}"


class Attachment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name='attachments'
    )
    file = models.FileField(upload_to='chat_attachments/')
    file_type = models.CharField(max_length=50, blank=True, null=True)  # e.g., 'image/png', 'video/mp4'
    file_size = models.BigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Attachment {self.id} for Message {self.message_id}"


class MessageReaction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name='reactions'
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='chat_reactions'
    )
    emoji = models.CharField(max_length=16)  # e.g. 👍, ❤️, 😂, 😮, 😢, 🙏
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('message', 'user', 'emoji')
        indexes = [
            models.Index(fields=['message', 'emoji']),
        ]

    def __str__(self):
        return f"{self.user} reacted {self.emoji} on {self.message_id}"


from django.db.models.signals import post_delete
from django.dispatch import receiver


@receiver(post_delete, sender=Attachment)
def auto_delete_file_on_attachment_delete(sender, instance, **kwargs):
    """
    Deletes underlying file from filesystem/storage when corresponding Attachment record is deleted.
    """
    if instance.file:
        try:
            instance.file.delete(save=False)
        except Exception:
            pass

