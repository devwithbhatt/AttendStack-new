import hashlib
import hmac
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import Organization, Payment, Plan


GST_RATE = Decimal("18.00")


def verify_payment_signature(order_id, payment_id, signature):
    message = f"{order_id}|{payment_id}".encode()
    expected = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode(),
        message,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def calculate_checkout(plan, billing_cycle, employee_count, is_simplyjob_linked=False):
    base_price = plan.yearly_price if billing_cycle == "yearly" else plan.monthly_price
    included = plan.included_employees
    extra = max(0, employee_count - included)

    overage = Decimal("0.00")
    if extra > 0:
        duration_multiplier = 12 if billing_cycle == "yearly" else 1
        if is_simplyjob_linked:
            rate = plan.simplyjob_overage_price_per_employee or Decimal("0")
        else:
            rate = plan.direct_overage_price_per_employee or Decimal("0")
        overage = rate * extra * duration_multiplier

    subtotal = (base_price + overage).quantize(Decimal("0.01"))
    taxable_amount = subtotal
    gst_amount = (taxable_amount * GST_RATE / Decimal("100")).quantize(Decimal("0.01"))
    total = taxable_amount + gst_amount

    return {
        "subtotal": subtotal,
        "base_price": base_price,
        "overage": overage,
        "extra_employees": extra,
        "taxable_amount": taxable_amount,
        "gst_rate": GST_RATE,
        "gst_amount": gst_amount,
        "amount": total.quantize(Decimal("0.01")),
    }


@transaction.atomic
def activate_payment(payment, provider_payment_id="", signature=""):
    payment = (
        Payment.objects.select_for_update(of=("self",))
        .select_related("plan", "organization")
        .get(pk=payment.pk)
    )
    if payment.status == Payment.Status.PAID:
        return payment.organization

    now = timezone.now()
    org = payment.organization
    plan = payment.plan
    duration_days = 365 if payment.billing_cycle == "yearly" else 30

    base_date = (
        org.plan_expires_at
        if org.plan_expires_at and org.plan_expires_at > now
        else now
    )
    org.plan_name = plan.name
    org.plan_expires_at = base_date + timedelta(days=duration_days)
    org.plan_source = "ZUPERHR_DIRECT"
    org.max_employees = payment.employee_count or plan.max_employees
    org.plan_status = Organization.PlanStatus.ACTIVE
    org.save(update_fields=[
        "plan_name", "plan_expires_at", "plan_source",
        "max_employees", "plan_status",
    ])

    payment.status = Payment.Status.PAID
    payment.provider_payment_id = provider_payment_id or payment.provider_payment_id
    payment.provider_signature = signature
    payment.paid_at = now
    payment.failure_reason = ""
    payment.save(update_fields=[
        "status", "provider_payment_id", "provider_signature",
        "paid_at", "failure_reason", "updated_at",
    ])

    return org
