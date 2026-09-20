from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError, NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import HasModulePermission
from organizations.services import get_organization_for_user

from .models import Role
from .registry import MODULE_REGISTRY
from .serializers import RoleSerializer
from .services import assign_role_to_user, unassign_role_from_user, ensure_admin_role


class RoleViewSet(viewsets.ModelViewSet):
    """
    Role & Permission Management.
    Employee -> Role -> Module -> Permission, scoped per organization.
    """

    serializer_class = RoleSerializer
    permission_classes = [IsAuthenticated, HasModulePermission]
    permission_module = "subadmins"
    queryset = Role.objects.none()

    def _organization(self, required=True):
        org = get_organization_for_user(self.request.user)
        if org is None and required:
            raise PermissionDenied("Set up a company workspace before managing roles.")
        return org

    def get_queryset(self):
        org = self._organization(required=False)
        if org is None:
            return Role.objects.none()
        ensure_admin_role(org)
        return Role.objects.filter(organization=org).prefetch_related("module_permissions", "assigned_users")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["organization"] = self._organization()
        return context

    def perform_create(self, serializer):
        org = self._organization()
        name = (serializer.validated_data.get("name") or "").strip()
        if Role.objects.filter(organization=org, name__iexact=name).exists():
            raise ValidationError({"name": "A role with this name already exists."})
        serializer.save(organization=org)

    def destroy(self, request, *args, **kwargs):
        role = self.get_object()
        if role.is_system:
            raise ValidationError({"detail": "The built-in Admin role cannot be deleted."})
        assigned = role.assigned_users.count()
        if assigned:
            raise ValidationError({
                "detail": f"Cannot delete '{role.name}' — it is currently assigned to {assigned} employee(s). "
                          f"Reassign them to a different role first."
            })
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["get"], url_path="modules")
    def modules(self, request):
        return Response(MODULE_REGISTRY)

    @action(detail=True, methods=["get"], url_path="employees")
    def employees(self, request, pk=None):
        """
        Every employee in this role's organization, with whether they're
        currently assigned this role — for the Assign Role checklist UI.
        """
        role = self.get_object()
        from django.contrib.auth import get_user_model
        from employees.models import Employee
        User = get_user_model()

        org_employees = Employee.objects.filter(organization=role.organization).order_by("full_name")
        emails = [e.email for e in org_employees]
        users_by_email = {
            u.email.lower(): u
            for u in User.objects.filter(email__in=emails).select_related("custom_role")
        }

        results = []
        for employee in org_employees:
            user = users_by_email.get(employee.email.lower())
            results.append({
                "employee_id": str(employee.id),
                "employee_code": employee.employee_id,
                "full_name": employee.full_name,
                "email": employee.email,
                "department": employee.department,
                "designation": employee.designation,
                "has_account": user is not None,
                "current_role_id": str(user.custom_role_id) if user and user.custom_role_id else None,
                "current_role_name": user.custom_role.name if user and user.custom_role_id else None,
                "assigned": bool(user and user.custom_role_id == role.id),
            })
        return Response(results)

    @action(detail=True, methods=["post"], url_path="assign")
    def assign(self, request, pk=None):
        """Assign this role to a user by user_id or email."""
        role = self.get_object()
        target_user = _resolve_user(request.data)
        assign_role_to_user(request.user, target_user, role)
        return Response({
            "detail": f"{target_user.email} has been assigned the '{role.name}' role.",
            "user_id": str(target_user.id),
            "email": target_user.email,
            "role": RoleSerializer(role).data,
        })

    @action(detail=False, methods=["post"], url_path="unassign")
    def unassign(self, request):
        """Revert a user to a plain Employee account with no custom role."""
        target_user = _resolve_user(request.data)
        unassign_role_from_user(target_user)
        return Response({"detail": f"{target_user.email} is now a regular Employee with no custom role."})


def _resolve_user(data):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    user_id = data.get("user_id")
    email = data.get("email")
    target_user = None
    if user_id:
        target_user = User.objects.filter(id=user_id).first()
    elif email:
        target_user = User.objects.filter(email__iexact=email).first()
    if not target_user:
        raise NotFound("No matching user account found.")
    return target_user
