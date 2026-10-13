import hashlib
import hmac
import json
import logging
import time
from decimal import Decimal

import requests
from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.utils import OperationalError
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .billing_services import (
    activate_payment,
    calculate_checkout,
    verify_payment_signature,
)
from .models import Organization, Payment, Plan, WebhookEvent
from .serializers import OrganizationSerializer

RAZORPAY_TIMEOUT = (5, 20)
logger = logging.getLogger("api.billing")


def _verification_unavailable(detail, *, code="payment_verification_unavailable"):
    exc = APIException({"detail": detail, "code": code, "retryable": True})
    exc.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return exc


def _activate_resilient(payment, payment_id="", signature=""):
    delays = (0, 0.15, 0.5)
    for attempt, delay in enumerate(delays, start=1):
        if delay:
            time.sleep(delay)
        try:
            return activate_payment(payment, payment_id, signature)
        except OperationalError as exc:
            is_locked = "locked" in str(exc).lower() or "could not obtain lock" in str(exc).lower()
            if not is_locked or attempt == len(delays):
                raise
            logger.error(
                "Transient lock order_id=%s attempt=%s", payment.provider_order_id, attempt
            )


def _find_user_organization(user):
    if hasattr(user, "_cached_org"):
        return user._cached_org
    org = Organization.objects.filter(owner=user).first()
    if not org:
        from employees.models import Employee
        emp = Employee.objects.filter(user=user).select_related("organization").first()
        org = emp.organization if emp else None
    user._cached_org = org
    return org


class CreateCheckoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        org = _find_user_organization(request.user)
        if not org:
            raise ValidationError({"detail": "No organization found."})

        plan_id = request.data.get("plan_id")
        billing_cycle = request.data.get("billing_cycle", "monthly")
        employee_count = int(request.data.get("employee_count", org.max_employees or 5))

        if billing_cycle not in ("monthly", "yearly"):
            raise ValidationError({"detail": "billing_cycle must be 'monthly' or 'yearly'."})

        plan = Plan.objects.filter(pk=plan_id, is_active=True).first()
        if not plan:
            raise ValidationError({"detail": "Plan not found."})
        if plan.requires_contact_sales:
            raise ValidationError({"detail": "This plan requires contacting sales."})

        is_simplyjob = bool(org.external_company_id and org.external_source == "SIMPLYJOB")
        calc = calculate_checkout(plan, billing_cycle, employee_count, is_simplyjob)

        payment = Payment.objects.create(
            organization=org,
            user=request.user,
            plan=plan,
            billing_cycle=billing_cycle,
            employee_count=employee_count,
            currency="INR",
            subtotal=calc["subtotal"],
            discount=Decimal("0"),
            taxable_amount=calc["taxable_amount"],
            gst_rate=calc["gst_rate"],
            gst_amount=calc["gst_amount"],
            amount=calc["amount"],
            metadata={
                "plan_name": plan.name,
                "plan_slug": plan.slug,
                "base_price": str(calc["base_price"]),
                "overage": str(calc["overage"]),
                "extra_employees": calc["extra_employees"],
                "organization_id": org.id,
                "organization_name": org.name,
            },
        )

        if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
            payment.status = Payment.Status.FAILED
            payment.failure_reason = "Payment gateway is not configured."
            payment.save(update_fields=["status", "failure_reason", "updated_at"])
            raise APIException("Payment gateway is not configured on the server.")

        try:
            resp = requests.post(
                "https://api.razorpay.com/v1/orders",
                auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET),
                json={
                    "amount": int(payment.amount * 100),
                    "currency": payment.currency,
                    "payment_capture": 1,
                    "receipt": f"as_{payment.reference.hex[:32]}",
                    "notes": {
                        "payment_reference": str(payment.reference),
                        "plan": plan.slug,
                        "organization_id": str(org.id),
                    },
                },
                timeout=RAZORPAY_TIMEOUT,
            )
            resp.raise_for_status()
            order = resp.json()
            if not order.get("id"):
                raise ValueError("Razorpay did not return an order id.")
        except (requests.RequestException, ValueError) as exc:
            payment.status = Payment.Status.FAILED
            payment.failure_reason = "Could not create payment order."
            payment.save(update_fields=["status", "failure_reason", "updated_at"])
            raise APIException("Could not create the Razorpay order. Please try again.") from exc

        payment.provider_order_id = order["id"]
        payment.save(update_fields=["provider_order_id", "updated_at"])

        return Response(
            {
                "payment_required": True,
                "reference": str(payment.reference),
                "key": settings.RAZORPAY_KEY_ID,
                "order_id": payment.provider_order_id,
                "amount": int(payment.amount * 100),
                "currency": payment.currency,
                "name": "ZuperHR Suite",
                "description": f"{plan.name} ({billing_cycle})",
                "prefill": {
                    "name": request.user.get_full_name(),
                    "email": request.user.email,
                    "contact": getattr(org, "phone", "") or "",
                },
                "breakdown": {
                    "subtotal": str(calc["subtotal"]),
                    "base_price": str(calc["base_price"]),
                    "overage": str(calc["overage"]),
                    "extra_employees": calc["extra_employees"],
                    "gst_rate": str(calc["gst_rate"]),
                    "gst_amount": str(calc["gst_amount"]),
                    "total": str(calc["amount"]),
                },
            },
            status=status.HTTP_201_CREATED,
        )


class VerifyCheckoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        order_id = str(request.data.get("razorpay_order_id", ""))
        payment_id = str(request.data.get("razorpay_payment_id", ""))
        signature = str(request.data.get("razorpay_signature", ""))

        if not all([order_id, payment_id, signature]):
            raise ValidationError({"detail": "Missing payment verification fields."})

        payment = Payment.objects.filter(
            user=request.user, provider_order_id=order_id
        ).select_related("plan", "organization").first()

        if not payment:
            raise ValidationError({"detail": "Payment not found."})

        if not verify_payment_signature(order_id, payment_id, signature):
            payment.status = Payment.Status.FAILED
            payment.failure_reason = "Signature verification failed."
            payment.save(update_fields=["status", "failure_reason", "updated_at"])
            raise ValidationError({"detail": "Payment signature verification failed."})

        if payment.status == Payment.Status.PAID:
            if payment.provider_payment_id != payment_id:
                raise ValidationError({"detail": "Payment id does not match the completed order."})
            return Response({
                "payment": _payment_response(payment),
                "organization": OrganizationSerializer(payment.organization).data,
            })

        try:
            provider_resp = requests.get(
                f"https://api.razorpay.com/v1/payments/{payment_id}",
                auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET),
                timeout=RAZORPAY_TIMEOUT,
            )
            provider_resp.raise_for_status()
            provider_payment = provider_resp.json()
        except (requests.RequestException, ValueError) as exc:
            logger.error(
                "Razorpay confirmation unavailable order_id=%s payment_id=%s error=%s",
                order_id, payment_id, exc,
            )
            raise _verification_unavailable(
                "Payment received but confirmation is temporarily unavailable. Please retry; you will not be charged again."
            ) from exc

        if provider_payment.get("status") != "captured":
            raise ValidationError({"detail": "Payment is not captured yet."})
        if provider_payment.get("order_id") != payment.provider_order_id:
            raise ValidationError({"detail": "Order mismatch."})
        if provider_payment.get("amount") != int(payment.amount * 100):
            raise ValidationError({"detail": "Payment amount does not match."})

        payment.provider_payment_id = payment_id
        payment.provider_signature = signature
        try:
            payment.save(update_fields=["provider_payment_id", "provider_signature", "updated_at"])
        except IntegrityError:
            raise ValidationError({"detail": "This payment is already linked to another order."})

        try:
            org = _activate_resilient(payment, payment_id, signature)
        except Exception as exc:
            logger.exception(
                "Payment activation failed order_id=%s payment_id=%s", order_id, payment_id
            )
            raise _verification_unavailable(
                "Payment verified but plan activation is temporarily delayed. Please retry; you will not be charged again.",
                code="payment_activation_delayed",
            ) from exc

        payment.refresh_from_db()
        return Response({
            "payment": _payment_response(payment),
            "organization": OrganizationSerializer(org).data,
        })


class RazorpayWebhookView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        secret = settings.RAZORPAY_WEBHOOK_SECRET
        if not secret:
            return Response(
                {"detail": "Webhook not configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        body = request.body
        sig = request.headers.get("X-Razorpay-Signature", "")
        expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, sig):
            return Response({"detail": "Invalid signature."}, status=status.HTTP_400_BAD_REQUEST)

        payload = json.loads(body.decode("utf-8"))
        event_id = request.headers.get("X-Razorpay-Event-Id") or hashlib.sha256(body).hexdigest()

        if WebhookEvent.objects.filter(event_id=event_id).exists():
            return Response({"processed": True, "duplicate": True})

        event_type = payload.get("event", "")
        with transaction.atomic():
            WebhookEvent.objects.create(event_id=event_id, event_type=event_type, payload=payload)
            if event_type in ("payment.captured", "order.paid"):
                pe = payload.get("payload", {}).get("payment", {}).get("entity", {})
                order_id = pe.get("order_id")
                payment_id = pe.get("id")
                payment = Payment.objects.select_for_update().filter(
                    provider_order_id=order_id
                ).first()
                if payment and payment.status != Payment.Status.PAID:
                    if (
                        pe.get("status") == "captured"
                        and pe.get("amount") == int(payment.amount * 100)
                    ):
                        _activate_resilient(payment, payment_id)

        return Response({"processed": True})


class PaymentHistoryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        org = _find_user_organization(request.user)
        if not org:
            return Response([])

        payments = Payment.objects.filter(
            organization=org, status=Payment.Status.PAID
        ).select_related("plan").order_by("-paid_at")[:50]

        return Response([_payment_response(p) for p in payments])


def _payment_response(payment):
    return {
        "id": payment.id,
        "reference": str(payment.reference),
        "plan_name": payment.plan.name if payment.plan_id else "",
        "billing_cycle": payment.billing_cycle,
        "employee_count": payment.employee_count,
        "subtotal": str(payment.subtotal),
        "discount": str(payment.discount),
        "gst_rate": str(payment.gst_rate),
        "gst_amount": str(payment.gst_amount),
        "amount": str(payment.amount),
        "currency": payment.currency,
        "status": payment.status,
        "provider": payment.provider,
        "provider_order_id": payment.provider_order_id,
        "provider_payment_id": payment.provider_payment_id or "",
        "paid_at": payment.paid_at.isoformat() if payment.paid_at else None,
        "created_at": payment.created_at.isoformat(),
        "metadata": payment.metadata,
    }
