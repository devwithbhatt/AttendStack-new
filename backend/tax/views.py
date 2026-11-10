from decimal import Decimal

from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import check_user_module_permission
from attendance.permissions import IsAdminOrReadOnly
from employees.models import Employee
from organizations.services import resolve_organization_for_request

from .models import (
    CompanyTaxConfig,
    SalaryStructure,
    TaxDeclaration,
    MonthlyTDS,
    TDSChallan,
    TDSReturn,
    ProfessionalTaxSlab,
    DeclarationStatus,
)
from .serializers import (
    CompanyTaxConfigSerializer,
    SalaryStructureSerializer,
    TaxDeclarationSerializer,
    MonthlyTDSSerializer,
    TDSChallanSerializer,
    TDSReturnSerializer,
    TaxComputationRequestSerializer,
    ProfessionalTaxSlabSerializer,
)
from .tax_engine import (
    compute_annual_tax,
    compute_all_statutory_deductions,
    compute_tax_on_slabs_detailed,
    get_financial_year,
    NEW_REGIME_SLABS_2026_27,
    OLD_REGIME_SLABS_2026_27,
    NEW_REGIME_STANDARD_DEDUCTION,
    OLD_REGIME_STANDARD_DEDUCTION,
    NEW_REGIME_87A_REBATE_LIMIT,
    NEW_REGIME_87A_REBATE_MAX,
    CESS_RATE,
    ZERO,
    money,
)


class CompanyTaxConfigViewSet(viewsets.ModelViewSet):
    serializer_class = CompanyTaxConfigSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        org = resolve_organization_for_request(self.request)
        if org:
            return CompanyTaxConfig.objects.filter(organization=org)
        return CompanyTaxConfig.objects.none()

    def perform_create(self, serializer):
        org = resolve_organization_for_request(self.request)
        serializer.save(organization=org)


class SalaryStructureViewSet(viewsets.ModelViewSet):
    serializer_class = SalaryStructureSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        org = resolve_organization_for_request(self.request)
        qs = SalaryStructure.objects.select_related("employee")
        if org:
            qs = qs.filter(employee__organization=org)
        else:
            qs = qs.none()
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(employee__full_name__icontains=search)
        return qs


class TaxDeclarationViewSet(viewsets.ModelViewSet):
    serializer_class = TaxDeclarationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        org = resolve_organization_for_request(self.request)
        qs = TaxDeclaration.objects.select_related("employee")

        # Employees see only their own declarations
        if not check_user_module_permission(user, "payroll", "view"):
            qs = qs.filter(employee__email__iexact=user.email)
        elif org:
            qs = qs.filter(employee__organization=org)
        else:
            qs = qs.none()

        fy = self.request.query_params.get("financial_year")
        if fy:
            qs = qs.filter(financial_year=fy)
        return qs

    @action(detail=True, methods=["post"], url_path="submit")
    def submit_declaration(self, request, pk=None):
        declaration = self.get_object()
        if declaration.status != DeclarationStatus.DRAFT:
            return Response(
                {"detail": "Only draft declarations can be submitted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        declaration.status = DeclarationStatus.SUBMITTED
        declaration.submitted_at = timezone.now()
        declaration.save()
        return Response(TaxDeclarationSerializer(declaration).data)

    @action(detail=True, methods=["post"], url_path="verify")
    def verify_declaration(self, request, pk=None):
        declaration = self.get_object()
        if declaration.status != DeclarationStatus.SUBMITTED:
            return Response(
                {"detail": "Only submitted declarations can be verified."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        declaration.status = DeclarationStatus.VERIFIED
        declaration.verified_by = request.user
        declaration.verified_at = timezone.now()
        declaration.save()
        return Response(TaxDeclarationSerializer(declaration).data)

    @action(detail=False, methods=["get", "put"], url_path="my-declaration")
    def my_declaration(self, request):
        """Employee self-service: view or update own tax declaration for the current FY."""
        user = request.user
        emp = Employee.objects.filter(email__iexact=user.email).first()
        if not emp:
            return Response({"detail": "No employee record linked to your account."}, status=status.HTTP_404_NOT_FOUND)

        from datetime import date
        today = date.today()
        fy = get_financial_year(today.month, today.year)

        if request.method == "GET":
            declaration = TaxDeclaration.objects.filter(employee=emp, financial_year=fy).first()
            if not declaration:
                return Response({
                    "exists": False,
                    "financial_year": fy,
                    "employee_name": emp.full_name,
                    "employee_id": emp.employee_id,
                    "annual_salary": str(emp.annual_salary or 0),
                })
            data = TaxDeclarationSerializer(declaration).data
            data["exists"] = True
            data["annual_salary"] = str(emp.annual_salary or 0)
            return Response(data)

        # PUT — create or update
        declaration, created = TaxDeclaration.objects.get_or_create(
            employee=emp,
            financial_year=fy,
            defaults={"status": DeclarationStatus.DRAFT},
        )
        if declaration.status == DeclarationStatus.LOCKED:
            return Response(
                {"detail": "Your declaration is locked for this FY and cannot be changed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Allow editing if DRAFT or SUBMITTED (re-opens to DRAFT on edit)
        editable_fields = [
            "tax_regime",
            "section_80c", "section_80ccd_1b",
            "section_80d_self", "section_80d_parents",
            "section_80e", "section_80g", "section_80tta",
            "hra_claimed", "home_loan_interest", "home_loan_principal",
            "other_income", "previous_employer_salary", "previous_employer_tds",
        ]
        for field in editable_fields:
            if field in request.data:
                setattr(declaration, field, request.data[field])

        # If it was SUBMITTED/VERIFIED before, re-editing resets to DRAFT
        if declaration.status in (DeclarationStatus.SUBMITTED, DeclarationStatus.VERIFIED):
            declaration.status = DeclarationStatus.DRAFT
            declaration.submitted_at = None

        declaration.save()
        data = TaxDeclarationSerializer(declaration).data
        data["exists"] = True
        data["annual_salary"] = str(emp.annual_salary or 0)
        return Response(data)

    @action(detail=False, methods=["post"], url_path="my-declaration/submit")
    def submit_my_declaration(self, request):
        """Employee submits their own declaration for admin verification."""
        user = request.user
        emp = Employee.objects.filter(email__iexact=user.email).first()
        if not emp:
            return Response({"detail": "No employee record linked to your account."}, status=status.HTTP_404_NOT_FOUND)

        from datetime import date
        fy = get_financial_year(date.today().month, date.today().year)
        declaration = TaxDeclaration.objects.filter(employee=emp, financial_year=fy).first()
        if not declaration:
            return Response({"detail": "No declaration found. Please save your declaration first."}, status=status.HTTP_404_NOT_FOUND)
        if declaration.status not in (DeclarationStatus.DRAFT,):
            return Response({"detail": f"Declaration is already {declaration.get_status_display()}."}, status=status.HTTP_400_BAD_REQUEST)

        declaration.status = DeclarationStatus.SUBMITTED
        declaration.submitted_at = timezone.now()
        declaration.save()
        data = TaxDeclarationSerializer(declaration).data
        data["exists"] = True
        return Response(data)



class MonthlyTDSViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MonthlyTDSSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        org = resolve_organization_for_request(self.request)
        qs = MonthlyTDS.objects.select_related("employee")

        if not check_user_module_permission(user, "payroll", "view"):
            qs = qs.filter(employee__email__iexact=user.email)
        elif org:
            qs = qs.filter(employee__organization=org)
        else:
            qs = qs.none()

        fy = self.request.query_params.get("financial_year")
        if fy:
            qs = qs.filter(financial_year=fy)
        employee_id = self.request.query_params.get("employee_id")
        if employee_id:
            qs = qs.filter(employee_id=employee_id)
        return qs


class TDSChallanViewSet(viewsets.ModelViewSet):
    serializer_class = TDSChallanSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        org = resolve_organization_for_request(self.request)
        qs = TDSChallan.objects.all()
        if org:
            qs = qs.filter(organization=org)
        else:
            qs = qs.none()
        fy = self.request.query_params.get("financial_year")
        if fy:
            qs = qs.filter(financial_year=fy)
        return qs

    def perform_create(self, serializer):
        org = resolve_organization_for_request(self.request)
        serializer.save(organization=org)

    @action(detail=False, methods=["post"], url_path="generate-for-month")
    def generate_for_month(self, request):
        """Auto-generate a Challan 281 for a given month from MonthlyTDS records."""
        org = resolve_organization_for_request(request)
        if not org:
            return Response({"detail": "Organization not found."}, status=status.HTTP_400_BAD_REQUEST)

        month = int(request.data.get("month", 0))
        year = int(request.data.get("year", 0))
        if not (1 <= month <= 12) or year < 2020:
            return Response({"detail": "Valid month and year are required."}, status=status.HTTP_400_BAD_REQUEST)

        fy = get_financial_year(month, year)

        existing = TDSChallan.objects.filter(organization=org, financial_year=fy, month=month).first()
        if existing:
            if existing.status == "FAILED":
                existing.delete()
            else:
                return Response({
                    "detail": f"Challan already exists for {month}/{year}.",
                    "challan": TDSChallanSerializer(existing).data,
                }, status=status.HTTP_409_CONFLICT)

        tds_records = MonthlyTDS.objects.filter(
            employee__organization=org, financial_year=fy, month=month, year=year,
        )
        total_tds = sum((t.tds_this_month for t in tds_records), Decimal("0"))
        if total_tds <= 0:
            return Response({"detail": "No TDS deducted for this month."}, status=status.HTTP_400_BAD_REQUEST)

        # Quarter mapping
        quarter_map = {4: "Q1", 5: "Q1", 6: "Q1", 7: "Q2", 8: "Q2", 9: "Q2",
                       10: "Q3", 11: "Q3", 12: "Q3", 1: "Q4", 2: "Q4", 3: "Q4"}
        quarter = quarter_map[month]

        # Assessment year = FY start + 1
        fy_start = int(fy.split("-")[0])
        ay = f"{fy_start + 1}-{str(fy_start + 2)[2:]}"

        # Due date: 7th of next month (30th April for March)
        from datetime import date
        if month == 3:
            due = date(year, 4, 30)
        elif month == 12:
            due = date(year + 1, 1, 7)
        else:
            due = date(year, month + 1, 7)

        challan = TDSChallan.objects.create(
            organization=org,
            financial_year=fy,
            assessment_year=ay,
            quarter=quarter,
            month=month,
            total_tds_amount=total_tds,
            total_deposit=total_tds,
            due_date=due,
            status="PENDING",
        )

        # Employee-wise breakdown for the challan
        emp_breakdown = []
        for t in tds_records:
            if t.tds_this_month > 0:
                emp = t.employee
                emp_breakdown.append({
                    "employee_name": emp.full_name,
                    "employee_id": emp.employee_id,
                    "pan": getattr(emp, "pan_number", "") or "",
                    "tds_amount": str(t.tds_this_month),
                })

        return Response({
            "challan": TDSChallanSerializer(challan).data,
            "employee_breakdown": emp_breakdown,
            "total_employees": len(emp_breakdown),
            "message": f"Challan generated for {month}/{year}: ₹{int(total_tds):,} TDS across {len(emp_breakdown)} employees.",
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="mark-paid")
    def mark_paid(self, request, pk=None):
        """Record payment details after depositing TDS through bank/TIN-NSDL."""
        challan = self.get_object()
        if challan.status in ("PAID", "VERIFIED"):
            return Response({"detail": "Challan is already marked as paid."}, status=status.HTTP_400_BAD_REQUEST)

        cin = request.data.get("cin", "")
        bsr_code = request.data.get("bsr_code", "")
        challan_serial = request.data.get("challan_serial", "")
        payment_date = request.data.get("payment_date")
        payment_mode = request.data.get("payment_mode", "")

        if not cin or not payment_date:
            return Response({"detail": "CIN and payment_date are required."}, status=status.HTTP_400_BAD_REQUEST)

        challan.cin = cin
        challan.bsr_code = bsr_code
        challan.challan_serial = challan_serial
        challan.payment_date = payment_date
        challan.payment_mode = payment_mode
        challan.status = "PAID"
        challan.save()
        return Response(TDSChallanSerializer(challan).data)

    @action(detail=False, methods=["get"], url_path="timeline")
    def timeline(self, request):
        """Compliance timeline: all months in the FY with challan status."""
        org = resolve_organization_for_request(request)
        if not org:
            return Response({"detail": "Organization not found."}, status=status.HTTP_400_BAD_REQUEST)

        from datetime import date
        fy = request.query_params.get("financial_year")
        if not fy:
            today = date.today()
            fy = get_financial_year(today.month, today.year)

        fy_start = int(fy.split("-")[0])
        fy_months = [(m, fy_start if m >= 4 else fy_start + 1) for m in [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]]

        challans = {c.month: c for c in TDSChallan.objects.filter(organization=org, financial_year=fy)}
        month_names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        quarter_map = {4: "Q1", 5: "Q1", 6: "Q1", 7: "Q2", 8: "Q2", 9: "Q2",
                       10: "Q3", 11: "Q3", 12: "Q3", 1: "Q4", 2: "Q4", 3: "Q4"}

        timeline = []
        for month, year in fy_months:
            tds_records = MonthlyTDS.objects.filter(
                employee__organization=org, financial_year=fy, month=month, year=year,
            )
            total_tds = sum((t.tds_this_month for t in tds_records), Decimal("0"))
            total_employees = tds_records.filter(tds_this_month__gt=0).count()
            challan = challans.get(month)

            # Due date
            if month == 3:
                due = date(year, 4, 30)
            elif month == 12:
                due = date(year + 1, 1, 7)
            else:
                due = date(year, month + 1, 7)

            today = date.today()
            is_past = date(year, month, 28) < today
            is_overdue = is_past and (not challan or challan.status == "PENDING") and total_tds > 0

            timeline.append({
                "month": month,
                "year": year,
                "month_name": f"{month_names[month]} {year}",
                "quarter": quarter_map[month],
                "tds_amount": str(total_tds),
                "employees": total_employees,
                "due_date": str(due),
                "is_past": is_past,
                "is_overdue": is_overdue,
                "challan_status": challan.status if challan else ("NOT_GENERATED" if total_tds > 0 else "NO_TDS"),
                "challan_id": challan.id if challan else None,
                "cin": challan.cin if challan else "",
                "payment_date": str(challan.payment_date) if challan and challan.payment_date else "",
            })

        # Quarterly return status
        returns = {r.quarter: r for r in TDSReturn.objects.filter(organization=org, financial_year=fy)}
        quarters = []
        for q in ["Q1", "Q2", "Q3", "Q4"]:
            q_months = [t for t in timeline if t["quarter"] == q]
            q_total_tds = sum(Decimal(t["tds_amount"]) for t in q_months)
            q_employees = max((t["employees"] for t in q_months), default=0)
            ret = returns.get(q)
            quarters.append({
                "quarter": q,
                "total_tds": str(q_total_tds),
                "employees": q_employees,
                "return_status": ret.status if ret else "NOT_FILED",
                "return_id": ret.id if ret else None,
                "filing_date": str(ret.filing_date) if ret and ret.filing_date else "",
                "acknowledgement": ret.acknowledgement_number if ret else "",
                "due_date": str(ret.due_date) if ret else "",
            })

        return Response({
            "financial_year": fy,
            "months": timeline,
            "quarters": quarters,
        })


class TDSReturnViewSet(viewsets.ModelViewSet):
    serializer_class = TDSReturnSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        org = resolve_organization_for_request(self.request)
        qs = TDSReturn.objects.all()
        if org:
            qs = qs.filter(organization=org)
        else:
            qs = qs.none()
        fy = self.request.query_params.get("financial_year")
        if fy:
            qs = qs.filter(financial_year=fy)
        return qs

    def perform_create(self, serializer):
        org = resolve_organization_for_request(self.request)
        serializer.save(organization=org)

    @action(detail=False, methods=["get"], url_path="generate-24q-data")
    def generate_24q_data(self, request):
        """Generate Form 24Q data for a quarter — employee-wise PAN + TDS mapping."""
        org = resolve_organization_for_request(request)
        if not org:
            return Response({"detail": "Organization not found."}, status=status.HTTP_400_BAD_REQUEST)

        from datetime import date
        fy = request.query_params.get("financial_year")
        if not fy:
            today = date.today()
            fy = get_financial_year(today.month, today.year)

        quarter = request.query_params.get("quarter")
        if quarter not in ("Q1", "Q2", "Q3", "Q4"):
            return Response({"detail": "Valid quarter (Q1-Q4) is required."}, status=status.HTTP_400_BAD_REQUEST)

        quarter_months = {"Q1": [4, 5, 6], "Q2": [7, 8, 9], "Q3": [10, 11, 12], "Q4": [1, 2, 3]}
        months = quarter_months[quarter]

        fy_start = int(fy.split("-")[0])

        try:
            config = CompanyTaxConfig.objects.get(organization=org)
        except CompanyTaxConfig.DoesNotExist:
            config = None

        deductees = []
        all_tds = MonthlyTDS.objects.filter(
            employee__organization=org, financial_year=fy, month__in=months,
        ).select_related("employee")

        emp_data = {}
        for t in all_tds:
            eid = t.employee_id
            if eid not in emp_data:
                emp = t.employee
                annual_salary = Decimal(str(emp.annual_salary or 0))
                try:
                    ss = SalaryStructure.objects.get(employee=emp)
                    annual_salary = ss.annual_gross
                except SalaryStructure.DoesNotExist:
                    pass
                emp_data[eid] = {
                    "employee_name": emp.full_name,
                    "employee_id": emp.employee_id,
                    "pan": getattr(emp, "pan_number", "") or "",
                    "designation": getattr(emp, "designation", "") or "",
                    "months": {},
                    "total_tds": Decimal("0"),
                    "annual_salary": annual_salary,
                }
            emp_data[eid]["months"][t.month] = {
                "tds": str(t.tds_this_month),
                "gross": str(t.estimated_annual_income),
            }
            emp_data[eid]["total_tds"] += t.tds_this_month

        for eid, d in emp_data.items():
            if d["total_tds"] > 0:
                deductees.append({
                    "employee_name": d["employee_name"],
                    "employee_id": d["employee_id"],
                    "pan": d["pan"],
                    "designation": d["designation"],
                    "annual_salary": str(d["annual_salary"]),
                    "tds_deducted": str(d["total_tds"]),
                    "month_details": d["months"],
                })

        total_tds = sum(Decimal(d["tds_deducted"]) for d in deductees)

        # Challan references for this quarter
        challans = TDSChallan.objects.filter(
            organization=org, financial_year=fy, quarter=quarter,
        ).order_by("month")
        challan_refs = [{
            "month": c.month,
            "cin": c.cin,
            "bsr_code": c.bsr_code,
            "amount": str(c.total_deposit),
            "payment_date": str(c.payment_date) if c.payment_date else "",
            "status": c.status,
        } for c in challans]

        ay = f"{fy_start + 1}-{str(fy_start + 2)[2:]}"

        return Response({
            "form_type": "24Q",
            "financial_year": fy,
            "assessment_year": ay,
            "quarter": quarter,
            "tan": config.tan_number if config else "",
            "organization_name": org.name,
            "total_deductees": len(deductees),
            "total_tds_deducted": str(total_tds),
            "deductees": deductees,
            "challans": challan_refs,
        })

    @action(detail=False, methods=["get"], url_path="generate-form16")
    def generate_form16(self, request):
        """Generate Form 16 data for an employee — Part A (TDS deposited) + Part B (income & tax)."""
        org = resolve_organization_for_request(request)
        if not org:
            return Response({"detail": "Organization not found."}, status=status.HTTP_400_BAD_REQUEST)

        employee_id = request.query_params.get("employee_id")
        if not employee_id:
            return Response({"detail": "employee_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            emp = Employee.objects.get(id=employee_id, organization=org)
        except Employee.DoesNotExist:
            return Response({"detail": "Employee not found."}, status=status.HTTP_404_NOT_FOUND)

        from datetime import date
        fy = request.query_params.get("financial_year")
        if not fy:
            today = date.today()
            fy = get_financial_year(today.month, today.year)

        fy_start = int(fy.split("-")[0])
        ay = f"{fy_start + 1}-{str(fy_start + 2)[2:]}"

        try:
            config = CompanyTaxConfig.objects.get(organization=org)
        except CompanyTaxConfig.DoesNotExist:
            config = None

        tds_records = MonthlyTDS.objects.filter(
            employee=emp, financial_year=fy,
        ).order_by("year", "month")

        total_tds = sum((t.tds_this_month for t in tds_records), Decimal("0"))
        total_epf = sum((t.epf_employee for t in tds_records), Decimal("0"))
        total_pt = sum((t.professional_tax for t in tds_records), Decimal("0"))

        # Salary structure
        try:
            structure = SalaryStructure.objects.get(employee=emp)
        except SalaryStructure.DoesNotExist:
            annual = emp.annual_salary or 0
            structure = None

        annual_gross = structure.annual_gross if structure else Decimal(str(emp.annual_salary or 0))

        # Tax declaration
        declaration = TaxDeclaration.objects.filter(employee=emp, financial_year=fy).first()
        regime = "NEW"
        if declaration:
            regime = declaration.tax_regime
        elif config:
            regime = config.default_tax_regime

        chapter_via = ZERO
        hra_exemption = ZERO
        other_income = ZERO
        previous_employer_salary = ZERO
        if declaration:
            if regime == "OLD":
                chapter_via = declaration.total_chapter_via_deductions
                hra_exemption = declaration.hra_claimed
            other_income = declaration.other_income
            previous_employer_salary = declaration.previous_employer_salary

        tax_result = compute_annual_tax(
            annual_gross=annual_gross,
            regime=regime,
            chapter_via_deductions=chapter_via,
            hra_exemption=hra_exemption,
            other_income=other_income,
            previous_employer_salary=previous_employer_salary,
        )

        slabs = NEW_REGIME_SLABS_2026_27 if regime == "NEW" else OLD_REGIME_SLABS_2026_27
        slab_breakdown = compute_tax_on_slabs_detailed(tax_result.taxable_income, slabs)

        # Challan references
        challans = TDSChallan.objects.filter(
            organization=org, financial_year=fy, status__in=("PAID", "VERIFIED"),
        ).order_by("month")

        quarter_tds = {}
        for t in tds_records:
            qmap = {4: "Q1", 5: "Q1", 6: "Q1", 7: "Q2", 8: "Q2", 9: "Q2",
                    10: "Q3", 11: "Q3", 12: "Q3", 1: "Q4", 2: "Q4", 3: "Q4"}
            q = qmap[t.month]
            quarter_tds.setdefault(q, Decimal("0"))
            quarter_tds[q] += t.tds_this_month

        month_wise = [{
            "month": t.month,
            "year": t.year,
            "tds": str(t.tds_this_month),
            "gross": str(t.estimated_annual_income),
        } for t in tds_records]

        return Response({
            "form_type": "Form 16",
            "financial_year": fy,
            "assessment_year": ay,
            "part_a": {
                "employer_name": org.name,
                "employer_tan": config.tan_number if config else "",
                "employer_pan": "",
                "employee_name": emp.full_name,
                "employee_pan": getattr(emp, "pan_number", "") or "",
                "employee_id": emp.employee_id,
                "designation": getattr(emp, "designation", "") or "",
                "period": f"01-Apr-{fy_start} to 31-Mar-{fy_start + 1}",
                "quarter_wise_tds": {q: str(amt) for q, amt in quarter_tds.items()},
                "total_tds_deposited": str(total_tds),
                "challan_details": [{
                    "cin": c.cin,
                    "bsr_code": c.bsr_code,
                    "date_of_deposit": str(c.payment_date) if c.payment_date else "",
                    "amount": str(c.total_deposit),
                    "month": c.month,
                } for c in challans],
                "month_wise": month_wise,
            },
            "part_b": {
                "regime": regime,
                "gross_salary": str(tax_result.gross_salary),
                "standard_deduction": str(tax_result.standard_deduction),
                "chapter_via_deductions": str(tax_result.chapter_via_deductions),
                "hra_exemption": str(tax_result.hra_exemption),
                "taxable_income": str(tax_result.taxable_income),
                "slab_breakdown": slab_breakdown,
                "base_tax": str(tax_result.base_tax),
                "surcharge": str(tax_result.surcharge),
                "rebate_87a": str(tax_result.rebate_87a),
                "cess": str(tax_result.cess),
                "total_tax_liability": str(tax_result.total_tax),
                "total_tds_deducted": str(total_tds),
                "balance_tax": str(max(ZERO, tax_result.total_tax - total_tds)),
                "refund_due": str(max(ZERO, total_tds - tax_result.total_tax)),
                "total_epf_deducted": str(total_epf),
                "total_pt_deducted": str(total_pt),
            },
        })


class ProfessionalTaxSlabViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ProfessionalTaxSlabSerializer
    permission_classes = [IsAuthenticated]
    queryset = ProfessionalTaxSlab.objects.all()

    def get_queryset(self):
        qs = super().get_queryset()
        state = self.request.query_params.get("state")
        if state:
            qs = qs.filter(state__iexact=state)
        return qs


class TaxCalculatorView(viewsets.ViewSet):
    """Stateless tax calculator endpoint for admin preview / employee comparison."""
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["post"], url_path="compute")
    def compute(self, request):
        serializer = TaxComputationRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        result = compute_annual_tax(
            annual_gross=d["annual_gross"],
            regime=d["regime"],
            chapter_via_deductions=d.get("chapter_via_deductions", Decimal("0")),
            hra_exemption=d.get("hra_exemption", Decimal("0")),
            other_income=d.get("other_income", Decimal("0")),
        )
        return Response({
            "regime": result.regime,
            "gross_salary": str(result.gross_salary),
            "standard_deduction": str(result.standard_deduction),
            "chapter_via_deductions": str(result.chapter_via_deductions),
            "hra_exemption": str(result.hra_exemption),
            "taxable_income": str(result.taxable_income),
            "base_tax": str(result.base_tax),
            "surcharge": str(result.surcharge),
            "rebate_87a": str(result.rebate_87a),
            "cess": str(result.cess),
            "total_tax": str(result.total_tax),
            "effective_rate": str(
                (result.total_tax / result.gross_salary * 100).quantize(Decimal("0.01"))
                if result.gross_salary > 0 else "0.00"
            ),
        })

    @action(detail=False, methods=["post"], url_path="compare-regimes")
    def compare_regimes(self, request):
        serializer = TaxComputationRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        new_result = compute_annual_tax(annual_gross=d["annual_gross"], regime="NEW")
        old_result = compute_annual_tax(
            annual_gross=d["annual_gross"],
            regime="OLD",
            chapter_via_deductions=d.get("chapter_via_deductions", Decimal("0")),
            hra_exemption=d.get("hra_exemption", Decimal("0")),
            other_income=d.get("other_income", Decimal("0")),
        )

        def fmt(r):
            return {
                "regime": r.regime,
                "taxable_income": str(r.taxable_income),
                "total_tax": str(r.total_tax),
                "effective_rate": str(
                    (r.total_tax / r.gross_salary * 100).quantize(Decimal("0.01"))
                    if r.gross_salary > 0 else "0.00"
                ),
            }

        saving = new_result.total_tax - old_result.total_tax
        return Response({
            "new_regime": fmt(new_result),
            "old_regime": fmt(old_result),
            "savings_with_old": str(max(Decimal("0"), saving)),
            "savings_with_new": str(max(Decimal("0"), -saving)),
            "recommended": "NEW" if new_result.total_tax <= old_result.total_tax else "OLD",
        })

    @action(detail=False, methods=["get"], url_path="employee-tax-breakdown")
    def employee_tax_breakdown(self, request):
        """Full tax computation breakdown for an employee — used on payslip & profile."""
        org = resolve_organization_for_request(request)
        if not org:
            return Response({"detail": "Organization not found."}, status=status.HTTP_400_BAD_REQUEST)

        employee_id = request.query_params.get("employee_id")
        if not employee_id:
            return Response({"detail": "employee_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            emp = Employee.objects.get(id=employee_id, organization=org)
        except Employee.DoesNotExist:
            return Response({"detail": "Employee not found."}, status=status.HTTP_404_NOT_FOUND)

        from datetime import date
        month = int(request.query_params.get("month", date.today().month))
        year = int(request.query_params.get("year", date.today().year))

        fy = get_financial_year(month, year)

        # Load or auto-derive salary structure
        try:
            structure = SalaryStructure.objects.get(employee=emp)
        except SalaryStructure.DoesNotExist:
            annual = emp.annual_salary
            if not annual or annual <= 0:
                return Response({"detail": "No salary set for this employee."}, status=status.HTTP_400_BAD_REQUEST)
            from decimal import Decimal as D
            monthly_ctc = money(D(str(annual)) / D("12"))
            basic = money(monthly_ctc * D("0.40"))
            hra = money(basic * D("0.50"))
            special = money(monthly_ctc - basic - hra)
            structure = SalaryStructure(
                employee=emp, annual_ctc=annual,
                basic=basic, hra=hra, da=ZERO,
                special_allowance=special,
            )

        # Tax declaration
        declaration = TaxDeclaration.objects.filter(employee=emp, financial_year=fy).first()
        try:
            config = CompanyTaxConfig.objects.get(organization=org)
        except CompanyTaxConfig.DoesNotExist:
            config = None

        regime = "NEW"
        if declaration:
            regime = declaration.tax_regime
        elif config:
            regime = config.default_tax_regime

        annual_gross = structure.annual_gross
        slabs = NEW_REGIME_SLABS_2026_27 if regime == "NEW" else OLD_REGIME_SLABS_2026_27
        std_deduction = NEW_REGIME_STANDARD_DEDUCTION if regime == "NEW" else OLD_REGIME_STANDARD_DEDUCTION

        chapter_via = ZERO
        hra_exemption = ZERO
        other_income = ZERO
        previous_employer_salary = ZERO
        if declaration:
            if regime == "OLD":
                chapter_via = declaration.total_chapter_via_deductions
                hra_exemption = declaration.hra_claimed
            other_income = declaration.other_income
            previous_employer_salary = declaration.previous_employer_salary

        # Compute annual tax
        tax_result = compute_annual_tax(
            annual_gross=annual_gross,
            regime=regime,
            chapter_via_deductions=chapter_via,
            hra_exemption=hra_exemption,
            other_income=other_income,
            previous_employer_salary=previous_employer_salary,
        )

        # Slab breakdown
        slab_breakdown = compute_tax_on_slabs_detailed(tax_result.taxable_income, slabs)

        # Monthly TDS (Section 192 averaging)
        if month >= 4:
            month_index = month - 4
        else:
            month_index = month + 8
        remaining_months = max(1, 12 - month_index)

        # Cumulative TDS already deducted
        tds_records = MonthlyTDS.objects.filter(
            employee=emp, financial_year=fy
        ).exclude(month=month, year=year)
        tds_already = sum((t.tds_this_month for t in tds_records), ZERO)

        monthly_tds = money(max(ZERO, tax_result.total_tax - tds_already) / Decimal(str(remaining_months)))

        # EPF breakdown
        epf_info = None
        if config and config.epf_enabled and getattr(emp, 'epf_applicable', False):
            basic_plus_da = structure.basic + (structure.da if hasattr(structure, 'da') and structure.da else ZERO)
            wage_used = min(basic_plus_da, config.epf_wage_ceiling)
            epf_info = {
                "basic_plus_da": str(basic_plus_da),
                "wage_ceiling": str(config.epf_wage_ceiling),
                "wage_used": str(wage_used),
                "employee_rate": str(config.epf_employee_rate),
                "employer_rate": str(config.epf_employer_rate),
                "employee_contribution": str(money(wage_used * config.epf_employee_rate / Decimal("100"))),
                "employer_contribution": str(money(wage_used * config.epf_employer_rate / Decimal("100"))),
            }

        # PT breakdown
        pt_info = None
        if config and config.professional_tax_enabled and config.pt_state and getattr(emp, 'pt_applicable', False):
            from .tax_engine import compute_professional_tax
            pt_amount = compute_professional_tax(structure.monthly_gross, config.pt_state)
            pt_info = {
                "state": config.pt_state,
                "monthly_gross": str(structure.monthly_gross),
                "monthly_tax": str(pt_amount),
            }

        # ESI breakdown
        esi_info = None
        if config and config.esi_enabled and getattr(emp, 'esi_applicable', False):
            monthly_gross = structure.monthly_gross
            applicable = monthly_gross <= config.esi_wage_ceiling
            esi_info = {
                "monthly_gross": str(monthly_gross),
                "wage_ceiling": str(config.esi_wage_ceiling),
                "applicable": applicable,
                "employee_rate": str(config.esi_employee_rate),
                "employer_rate": str(config.esi_employer_rate),
                "employee_contribution": str(money(monthly_gross * config.esi_employee_rate / Decimal("100"))) if applicable else "0",
                "employer_contribution": str(money(monthly_gross * config.esi_employer_rate / Decimal("100"))) if applicable else "0",
            }

        return Response({
            "employee_name": emp.full_name,
            "employee_id": emp.employee_id,
            "financial_year": fy,
            "month": month,
            "year": year,
            "regime": regime,
            "annual_ctc": str(annual_gross),
            "salary_structure": {
                "basic": str(structure.basic),
                "hra": str(structure.hra),
                "da": str(structure.da if hasattr(structure, 'da') and structure.da else ZERO),
                "special_allowance": str(structure.special_allowance),
                "monthly_gross": str(structure.monthly_gross),
            },
            "tax_computation": {
                "gross_salary": str(tax_result.gross_salary),
                "standard_deduction": str(tax_result.standard_deduction),
                "standard_deduction_explanation": (
                    f"Flat ₹{int(std_deduction):,} deduction allowed to all salaried employees under "
                    f"{'New' if regime == 'NEW' else 'Old'} Tax Regime (Section 16(ia) of Income Tax Act). "
                    "No bills or proof required."
                ),
                "taxable_income": str(tax_result.taxable_income),
                "slab_breakdown": slab_breakdown,
                "base_tax": str(tax_result.base_tax),
                "surcharge": str(tax_result.surcharge),
                "rebate_87a": str(tax_result.rebate_87a),
                "rebate_87a_explanation": (
                    f"Section 87A rebate: If taxable income ≤ ₹{int(NEW_REGIME_87A_REBATE_LIMIT):,}, "
                    f"rebate up to ₹{int(NEW_REGIME_87A_REBATE_MAX):,} is available. "
                    f"Your taxable income: ₹{int(tax_result.taxable_income):,}."
                ) if regime == "NEW" else "",
                "cess": str(tax_result.cess),
                "cess_explanation": f"{CESS_RATE}% Health & Education Cess on tax after rebate",
                "total_annual_tax": str(tax_result.total_tax),
                "monthly_tds": str(monthly_tds),
                "tds_already_deducted": str(tds_already),
                "remaining_months": remaining_months,
                "tds_explanation": (
                    f"Section 192: (Annual Tax ₹{int(tax_result.total_tax):,} - "
                    f"TDS Already Deducted ₹{int(tds_already):,}) ÷ "
                    f"{remaining_months} remaining months = ₹{int(monthly_tds):,}/month"
                ),
            },
            "epf": epf_info,
            "esi": esi_info,
            "professional_tax": pt_info,
            "toggles": {
                "tds_applicable": getattr(emp, 'tds_applicable', False),
                "epf_applicable": getattr(emp, 'epf_applicable', False),
                "esi_applicable": getattr(emp, 'esi_applicable', False),
                "pt_applicable": getattr(emp, 'pt_applicable', False),
            },
        })

    @action(detail=False, methods=["get"], url_path="compliance-summary")
    def compliance_summary(self, request):
        """Dashboard summary of TDS compliance status for the organization."""
        org = resolve_organization_for_request(request)
        if not org:
            return Response({"detail": "Organization not found."}, status=status.HTTP_400_BAD_REQUEST)

        fy = request.query_params.get("financial_year")
        if not fy:
            from datetime import date
            today = date.today()
            fy = get_financial_year(today.month, today.year)

        challans = TDSChallan.objects.filter(organization=org, financial_year=fy)
        returns = TDSReturn.objects.filter(organization=org, financial_year=fy)
        monthly_tds = MonthlyTDS.objects.filter(
            employee__organization=org, financial_year=fy,
        )

        total_tds_liability = sum((t.tds_this_month for t in monthly_tds), Decimal("0"))
        total_tds_deposited = sum(
            (c.total_deposit for c in challans if c.status in ("PAID", "VERIFIED")),
            Decimal("0"),
        )
        pending_challans = challans.filter(status="PENDING").count()
        filed_returns = returns.filter(status__in=("FILED", "ACCEPTED")).count()

        try:
            config = CompanyTaxConfig.objects.get(organization=org)
            tan = config.tan_number
        except CompanyTaxConfig.DoesNotExist:
            tan = ""

        return Response({
            "financial_year": fy,
            "tan_number": tan,
            "total_tds_liability": str(total_tds_liability),
            "total_tds_deposited": str(total_tds_deposited),
            "outstanding": str(max(Decimal("0"), total_tds_liability - total_tds_deposited)),
            "pending_challans": pending_challans,
            "returns_filed": filed_returns,
            "returns_total": 4,
            "employees_covered": monthly_tds.values("employee").distinct().count(),
        })
