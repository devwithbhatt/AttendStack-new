from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import Employee
from .services import delete_employee_user


@receiver(post_delete, sender=Employee)
def delete_linked_login_account(sender, instance, **kwargs):
    delete_employee_user(instance)
