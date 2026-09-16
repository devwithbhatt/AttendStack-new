"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Container,
  Form,
  Modal,
  Row,
  Spinner,
  Table,
  ProgressBar,
  InputGroup,
} from "react-bootstrap";
import {
  IconBuildingSkyscraper,
  IconShieldCheck,
  IconUsers,
  IconCalendarEvent,
  IconPlus,
  IconRefresh,
  IconArrowUpRight,
  IconActivity,
  IconCheck,
  IconAlertTriangle,
  IconCopy,
  IconSearch,
  IconClock,
  IconTrendingUp,
  IconLayersSubtract,
} from "@tabler/icons-react";
import { ApexOptions } from "apexcharts";
import apiClient from "app/services/api";
import DasherBreadcrumb from "components/common/DasherBreadcrumb";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

type OverviewData = {
  summary: {
    total_companies: number;
    active_companies: number;
    inactive_companies: number;
    total_users: number;
    total_hrs: number;
    total_subadmins: number;
    total_employees: number;
    today_attendance: number;
    today_late: number;
    today_checked_in: number;
    attendance_rate: number;
    pending_leaves: number;
  };
  attendance_trend_7d?: Array<{
    date: string;
    day: string;
    label: string;
    present: number;
    late: number;
    total: number;
  }>;
  plan_distribution?: Array<{
    name: string;
    count: number;
    percentage: number;
  }>;
  recent_activities?: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    timestamp: string | null;
    badge: string;
    badge_color: string;
  }>;
  organizations: Array<{
    id: number;
    name: string;
    invite_code: string;
    owner_name: string | null;
    owner_email: string | null;
    is_active: boolean;
    plan_name?: string;
    plan_status?: string;
    created_at: string;
    employee_count: number;
    active_employee_count: number;
    today_attendance_count: number;
  }>;
};

export default function SuperAdminDashboardPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Search & Filter State for Tenants Table
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [chartViewMode, setChartViewMode] = useState<"TREND" | "TENANTS">("TREND");

  // Modal States
  const [showOnboardModal, setShowOnboardModal] = useState(false);
  const [onboardName, setOnboardName] = useState("");
  const [onboardLoading, setOnboardLoading] = useState(false);
  const [onboardSuccessMsg, setOnboardSuccessMsg] = useState("");

  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSuccessMsg, setAdminSuccessMsg] = useState("");

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiClient.get("/api/v1/organizations/superadmin-overview/");
      setData(response.data);
    } catch {
      setError("Unable to load live Super Admin telemetry. Please refresh or verify credentials.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
    const interval = setInterval(loadOverview, 60000);
    return () => clearInterval(interval);
  }, [loadOverview]);

  const copyInviteCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const attendancePercentage = useMemo(() => {
    if (data?.summary?.attendance_rate !== undefined) return data.summary.attendance_rate;
    if (!data?.summary?.total_employees) return 0;
    return Math.round((data.summary.today_attendance / data.summary.total_employees) * 100);
  }, [data]);

  // Filtered Organizations
  const filteredOrganizations = useMemo(() => {
    if (!data?.organizations) return [];
    return data.organizations.filter((org) => {
      const matchesSearch =
        org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (org.owner_name && org.owner_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (org.owner_email && org.owner_email.toLowerCase().includes(searchQuery.toLowerCase())) ||
        org.invite_code.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "ALL"
          ? true
          : statusFilter === "ACTIVE"
          ? org.is_active
          : !org.is_active;

      return matchesSearch && matchesStatus;
    });
  }, [data, searchQuery, statusFilter]);

  // Chart 1: 7-Day Attendance Trend (Area Chart)
  const trendLabels = useMemo(() => {
    return (data?.attendance_trend_7d || []).map((t) => t.label);
  }, [data]);

  const trendSeries = useMemo(() => {
    const presentData = (data?.attendance_trend_7d || []).map((t) => t.present);
    const lateData = (data?.attendance_trend_7d || []).map((t) => t.late);
    return [
      { name: "On-Time Present", data: presentData },
      { name: "Late Arrivals", data: lateData },
    ];
  }, [data]);

  const trendChartOptions: ApexOptions = {
    chart: {
      type: "area",
      toolbar: { show: false },
      fontFamily: "Inter, sans-serif",
    },
    colors: ["#10b981", "#f59e0b"],
    dataLabels: { enabled: false },
    stroke: { curve: "smooth", width: 2.5 },
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.55,
        opacityTo: 0.08,
        stops: [0, 90, 100],
      },
    },
    xaxis: {
      categories: trendLabels,
      labels: { style: { fontSize: "11.5px", fontWeight: 500, colors: "#64748b" } },
      axisBorder: { show: true, color: "#e2e8f0" },
    },
    yaxis: {
      title: { text: "Punches", style: { fontSize: "11.5px", fontWeight: 600, color: "#64748b" } },
      min: 0,
      forceNiceScale: true,
      labels: {
        formatter: (val) => Math.round(val).toString(),
        style: { fontSize: "11px", colors: "#64748b" },
      },
    },
    tooltip: {
      y: { formatter: (val: number) => `${val} employees` },
    },
    grid: {
      borderColor: "#f1f5f9",
      strokeDashArray: 4,
    },
    legend: {
      position: "top",
      horizontalAlign: "right",
      fontWeight: 600,
      fontSize: "12px",
    },
  };

  // Chart 1 (Alt): Tenant Workforce vs Check-ins Bar
  const companyChartLabels = useMemo(() => {
    return (data?.organizations || []).slice(0, 6).map((o) => {
      return o.name.length > 14 ? o.name.slice(0, 12) + "…" : o.name;
    });
  }, [data]);

  const companyWorkforceSeries = useMemo(() => {
    const workforce = (data?.organizations || []).slice(0, 6).map((o) => o.employee_count);
    const checkIns = (data?.organizations || []).slice(0, 6).map((o) => o.today_attendance_count);
    return [
      { name: "Total Staff", data: workforce },
      { name: "Today Checked-in", data: checkIns },
    ];
  }, [data]);

  const companyChartOptions: ApexOptions = {
    chart: {
      type: "bar",
      toolbar: { show: false },
      fontFamily: "Inter, sans-serif",
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "40%",
        borderRadius: 5,
        borderRadiusApplication: "end",
      },
    },
    colors: ["#2563eb", "#10b981"],
    fill: {
      type: "solid",
      opacity: 1,
    },
    dataLabels: { enabled: false },
    stroke: { show: true, width: 2, colors: ["transparent"] },
    xaxis: {
      categories: companyChartLabels,
      labels: {
        rotate: 0,
        trim: true,
        maxHeight: 50,
        style: { fontSize: "11.5px", fontWeight: 500, colors: "#475569" },
      },
      axisBorder: { show: true, color: "#e2e8f0" },
      axisTicks: { show: false },
    },
    yaxis: {
      title: { text: "Employees", style: { fontSize: "11.5px", fontWeight: 600, color: "#64748b" } },
      min: 0,
      forceNiceScale: true,
      labels: {
        formatter: (val) => Math.round(val).toString(),
        style: { fontSize: "11px", colors: "#64748b" },
      },
    },
    tooltip: {
      y: { formatter: (val: number) => `${val} staff members` },
    },
    grid: {
      borderColor: "#f1f5f9",
      strokeDashArray: 4,
    },
    legend: {
      position: "top",
      horizontalAlign: "right",
      fontWeight: 600,
      fontSize: "12px",
    },
  };

  // Chart 2: Plan & Tier Distribution Donut
  const planDistributionLabels = useMemo(() => {
    return (data?.plan_distribution || []).map((p) => p.name);
  }, [data]);

  const planDistributionSeries = useMemo(() => {
    return (data?.plan_distribution || []).map((p) => p.count);
  }, [data]);

  const planDonutOptions: ApexOptions = {
    chart: {
      type: "donut",
      fontFamily: "Inter, sans-serif",
    },
    labels: planDistributionLabels,
    colors: ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#06b6d4"],
    legend: {
      position: "bottom",
      fontSize: "12px",
    },
    plotOptions: {
      pie: {
        donut: {
          size: "72%",
          labels: {
            show: true,
            total: {
              show: true,
              label: "Tenants",
              formatter: () => `${data?.summary?.total_companies ?? 0}`,
            },
          },
        },
      },
    },
    dataLabels: { enabled: false },
    tooltip: {
      y: { formatter: (val: number) => `${val} tenant companies` },
    },
  };

  // Onboard Company Handler
  const handleOnboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onboardName.trim()) return;
    setOnboardLoading(true);
    setOnboardSuccessMsg("");
    try {
      const response = await apiClient.post("/api/v1/organizations/", {
        name: onboardName.trim(),
      });
      setOnboardSuccessMsg(`Company "${response.data.name}" successfully onboarded! Invite Code: ${response.data.invite_code}`);
      setOnboardName("");
      loadOverview();
    } catch {
      setError("Failed to onboard company. Please try again.");
    } finally {
      setOnboardLoading(false);
    }
  };

  // Add HR Admin Handler
  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmail.trim() || !adminPassword.trim() || !selectedOrgId) return;
    setAdminLoading(true);
    setAdminSuccessMsg("");
    try {
      await apiClient.post(`/api/v1/organizations/${selectedOrgId}/assign_owner/`, {
        name: adminName.trim() || adminEmail.split("@")[0],
        email: adminEmail.trim(),
        password: adminPassword.trim(),
      });
      setAdminSuccessMsg(`HR Owner account created and assigned successfully for ${adminEmail}!`);
      setAdminName("");
      setAdminEmail("");
      setAdminPassword("");
      setSelectedOrgId("");
      loadOverview();
    } catch {
      setError("Failed to create HR Administrator account. Verify details and try again.");
    } finally {
      setAdminLoading(false);
    }
  };

  return (
    <Container fluid className="py-3 px-lg-4 super-admin-dashboard-page">
      {/* Universal Breadcrumb */}
      <DasherBreadcrumb
        items={[
          { label: "Super Admin Command Center" },
        ]}
      />

      {/* Top Banner Control Hub */}
      <Card
        className="border-0 shadow-sm mb-4 bg-dark text-white rounded-3 overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)" }}
      >
        <Card.Body className="py-3.5 px-4 d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
          <div className="min-w-0">
            <div className="d-flex align-items-center gap-2 mb-1">
              <Badge
                bg="warning"
                text="dark"
                className="fw-bold font-monospace px-2 py-0.5 rounded-pill"
                style={{ letterSpacing: "0.04em", fontSize: "10px" }}
              >
                SUPER ADMIN
              </Badge>
              <span className="text-white-50 small d-flex align-items-center gap-1.5" style={{ fontSize: "11.5px" }}>
                <div className="rounded-circle bg-success" style={{ width: 7, height: 7 }} />
                Live Multi-Tenant Telemetry • 100% Operational
              </span>
            </div>
            <div className="d-flex flex-wrap align-items-baseline gap-2">
              <h4 className="fw-bold text-white mb-0" style={{ fontSize: "19px" }}>
                Platform Master Command Center
              </h4>
              <span className="text-white-50 small d-none d-lg-inline" style={{ fontSize: "12.5px" }}>
                • Enterprise multi-tenant operations, workforce analytics, and tenant management
              </span>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2 flex-shrink-0">
            <Button
              variant="warning"
              size="sm"
              className="fw-bold px-3 py-1.5 shadow-xs d-flex align-items-center gap-1.5 text-dark rounded-2"
              style={{ fontSize: "13px" }}
              onClick={() => {
                setOnboardSuccessMsg("");
                setShowOnboardModal(true);
              }}
            >
              <IconPlus size={16} />
              <span>Onboard Company</span>
            </Button>
            <Button
              variant="outline-light"
              size="sm"
              className="fw-semibold px-3 py-1.5 d-flex align-items-center gap-1.5 rounded-2"
              style={{ fontSize: "13px" }}
              onClick={() => {
                setAdminSuccessMsg("");
                setShowAdminModal(true);
              }}
            >
              <IconShieldCheck size={16} />
              <span>Add HR Administrator</span>
            </Button>
          </div>
        </Card.Body>
      </Card>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError("")} className="border-0 shadow-sm d-flex align-items-center gap-2 mb-4">
          <IconAlertTriangle size={20} />
          {error}
        </Alert>
      )}

      {/* Primary Platform Metric Cards (4 KPIs) */}
      <Row className="g-3.5 mb-4">
        <Col xs={12} sm={6} xl={3}>
          <Card className="border-0 shadow-sm h-100 stat-card">
            <Card.Body className="p-3.5 d-flex align-items-center gap-3">
              <div className="rounded-3 p-3 bg-primary-subtle text-primary d-flex align-items-center justify-content-center">
                <IconBuildingSkyscraper size={28} />
              </div>
              <div>
                <span className="text-secondary small fw-bold text-uppercase d-block mb-0.5" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>Total Tenant Orgs</span>
                <h3 className="mb-0 fw-bold text-dark">{loading ? <Spinner size="sm" /> : data?.summary?.total_companies ?? 0}</h3>
                <span className="text-success small fw-medium" style={{ fontSize: "12px" }}>
                  {data?.summary?.active_companies ?? 0} Active • {data?.summary?.inactive_companies ?? 0} Inactive
                </span>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} sm={6} xl={3}>
          <Card className="border-0 shadow-sm h-100 stat-card">
            <Card.Body className="p-3.5 d-flex align-items-center gap-3">
              <div className="rounded-3 p-3 bg-info-subtle text-info d-flex align-items-center justify-content-center">
                <IconUsers size={28} />
              </div>
              <div>
                <span className="text-secondary small fw-bold text-uppercase d-block mb-0.5" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>Global Workforce</span>
                <h3 className="mb-0 fw-bold text-dark">{loading ? <Spinner size="sm" /> : data?.summary?.total_employees ?? 0}</h3>
                <span className="text-info small fw-medium" style={{ fontSize: "12px" }}>
                  {data?.summary?.total_users ?? 0} Registered User Accounts
                </span>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} sm={6} xl={3}>
          <Card className="border-0 shadow-sm h-100 stat-card">
            <Card.Body className="p-3.5 d-flex align-items-center gap-3">
              <div className="rounded-3 p-3 bg-success-subtle text-success d-flex align-items-center justify-content-center">
                <IconCalendarEvent size={28} />
              </div>
              <div>
                <span className="text-secondary small fw-bold text-uppercase d-block mb-0.5" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>Today's Check-ins</span>
                <h3 className="mb-0 fw-bold text-dark">{loading ? <Spinner size="sm" /> : data?.summary?.today_checked_in ?? data?.summary?.today_attendance ?? 0}</h3>
                <span className="text-success small fw-medium" style={{ fontSize: "12px" }}>
                  {attendancePercentage}% Platform-wide Rate
                </span>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} sm={6} xl={3}>
          <Card className="border-0 shadow-sm h-100 stat-card">
            <Card.Body className="p-3.5 d-flex align-items-center gap-3">
              <div className="rounded-3 p-3 bg-warning-subtle text-warning-emphasis d-flex align-items-center justify-content-center">
                <IconShieldCheck size={28} />
              </div>
              <div>
                <span className="text-secondary small fw-bold text-uppercase d-block mb-0.5" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>Platform Admins</span>
                <h3 className="mb-0 fw-bold text-dark">{loading ? <Spinner size="sm" /> : (data?.summary?.total_hrs ?? 0) + (data?.summary?.total_subadmins ?? 0)}</h3>
                <span className="text-warning-emphasis small fw-medium" style={{ fontSize: "12px" }}>
                  {data?.summary?.total_hrs ?? 0} HR Owners • {data?.summary?.total_subadmins ?? 0} Sub-Admins
                </span>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Analytics Visualizations Row */}
      <Row className="g-4 mb-4">
        {/* Chart 1: 7-Day Attendance Volume / Tenant Performance */}
        <Col xs={12} lg={8}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Header className="bg-white border-0 py-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
              <div>
                <div className="d-flex align-items-center gap-2">
                  <h5 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
                    <IconTrendingUp className="text-primary" size={20} />
                    {chartViewMode === "TREND" ? "7-Day Platform Attendance Trends" : "Tenant Workforce vs Today Check-ins"}
                  </h5>
                  <Badge bg="primary-subtle" text="primary" className="border border-primary-subtle px-2 py-0.5 rounded-pill fw-semibold small">
                    Live Telemetry
                  </Badge>
                </div>
                <span className="text-secondary small">
                  {chartViewMode === "TREND"
                    ? "Daily on-time punches vs late arrivals across all company tenants"
                    : "Comparative volume of registered workforce vs today's check-ins"}
                </span>
              </div>
              <div className="d-flex align-items-center gap-1 bg-light p-1 rounded-2 border">
                <Button
                  size="sm"
                  variant={chartViewMode === "TREND" ? "white" : "light"}
                  className={`px-2.5 py-1 fw-semibold border-0 ${chartViewMode === "TREND" ? "shadow-xs text-primary" : "text-secondary"}`}
                  style={{ fontSize: "11.5px" }}
                  onClick={() => setChartViewMode("TREND")}
                >
                  7-Day Trend
                </Button>
                <Button
                  size="sm"
                  variant={chartViewMode === "TENANTS" ? "white" : "light"}
                  className={`px-2.5 py-1 fw-semibold border-0 ${chartViewMode === "TENANTS" ? "shadow-xs text-primary" : "text-secondary"}`}
                  style={{ fontSize: "11.5px" }}
                  onClick={() => setChartViewMode("TENANTS")}
                >
                  Tenants Bar
                </Button>
              </div>
            </Card.Header>
            <Card.Body className="pt-1 pb-3">
              {chartViewMode === "TREND" ? (
                trendLabels.length > 0 ? (
                  <Chart
                    options={trendChartOptions}
                    series={trendSeries}
                    type="area"
                    height={280}
                  />
                ) : (
                  <div className="text-center py-5 text-secondary">No trend telemetry available yet.</div>
                )
              ) : (
                companyChartLabels.length > 0 ? (
                  <Chart
                    options={companyChartOptions}
                    series={companyWorkforceSeries}
                    type="bar"
                    height={280}
                  />
                ) : (
                  <div className="text-center py-5 text-secondary">No tenant analytics available yet.</div>
                )
              )}
            </Card.Body>
          </Card>
        </Col>

        {/* Chart 2: Subscription Plans Distribution */}
        <Col xs={12} lg={4}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Header className="bg-white border-0 py-3 d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-2">
                <div className="p-1.5 rounded-2 bg-primary-subtle text-primary d-flex align-items-center justify-content-center">
                  <IconLayersSubtract size={18} />
                </div>
                <h6 className="fw-bold text-dark mb-0">Plan & Tier Breakdown</h6>
              </div>
              <Link href="/super-admin/plans" className="text-primary small fw-semibold text-decoration-none">
                Manage Plans <IconArrowUpRight size={14} />
              </Link>
            </Card.Header>
            <Card.Body className="pt-0 d-flex flex-column justify-content-center">
              {planDistributionSeries.length > 0 ? (
                <Chart
                  options={planDonutOptions}
                  series={planDistributionSeries}
                  type="donut"
                  height={260}
                />
              ) : (
                <div className="text-center py-5 text-secondary">No subscription breakdown available.</div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Managed Companies Full-Width Master Workspace Table */}
      <Card className="border-0 shadow-sm mb-4">
        <Card.Header className="bg-white border-0 py-3.5">
          <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3 mb-3">
            <div>
              <div className="d-flex align-items-center gap-2">
                <h5 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
                  <IconBuildingSkyscraper className="text-primary" size={22} />
                  Registered Company Tenants Directory
                </h5>
                <Badge bg="primary-subtle" text="primary" className="border border-primary-subtle px-2 py-0.5 rounded-pill fw-semibold small">
                  {filteredOrganizations.length} Companies
                </Badge>
              </div>
              <span className="text-secondary small">Live view of tenant organizations, owner assignments, and access codes</span>
            </div>

            <div className="d-flex align-items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline-secondary" onClick={loadOverview} disabled={loading} title="Refresh Live Data">
                <IconRefresh size={15} className={loading ? "spin" : ""} />
              </Button>
              <Link href="/super-admin/companies" className="btn btn-primary btn-sm px-3 fw-semibold d-inline-flex align-items-center gap-1.5 shadow-xs">
                <span>Manage Workspace</span>
                <IconArrowUpRight size={15} />
              </Link>
            </div>
          </div>

          {/* Search Bar & Status Filters */}
          <div className="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-2.5 pt-2 border-top">
            <div style={{ maxWidth: 360 }} className="w-100">
              <InputGroup size="sm">
                <InputGroup.Text className="bg-light border-end-0 text-secondary">
                  <IconSearch size={14} />
                </InputGroup.Text>
                <Form.Control
                  placeholder="Search tenant name, owner email, code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="border-start-0 bg-light"
                  style={{ fontSize: "12.5px" }}
                />
              </InputGroup>
            </div>

            <div className="d-flex align-items-center gap-1.5">
              <Button
                size="sm"
                variant={statusFilter === "ALL" ? "primary" : "outline-secondary"}
                className="px-2.5 py-1 fw-semibold"
                style={{ fontSize: "11.5px" }}
                onClick={() => setStatusFilter("ALL")}
              >
                All ({data?.organizations?.length || 0})
              </Button>
              <Button
                size="sm"
                variant={statusFilter === "ACTIVE" ? "success" : "outline-secondary"}
                className="px-2.5 py-1 fw-semibold"
                style={{ fontSize: "11.5px" }}
                onClick={() => setStatusFilter("ACTIVE")}
              >
                Active ({data?.summary?.active_companies || 0})
              </Button>
              <Button
                size="sm"
                variant={statusFilter === "INACTIVE" ? "danger" : "outline-secondary"}
                className="px-2.5 py-1 fw-semibold"
                style={{ fontSize: "11.5px" }}
                onClick={() => setStatusFilter("INACTIVE")}
              >
                Inactive ({data?.summary?.inactive_companies || 0})
              </Button>
            </div>
          </div>
        </Card.Header>

        <Card.Body className="p-0">
          {loading ? (
            <div className="text-center py-5">
              <Spinner animation="border" variant="primary" />
            </div>
          ) : filteredOrganizations.length === 0 ? (
            <div className="text-center py-5">
              <p className="text-secondary mb-2">No tenant companies match your filter criteria.</p>
              <Button size="sm" variant="outline-primary" onClick={() => { setSearchQuery(""); setStatusFilter("ALL"); }}>
                Clear Filters
              </Button>
            </div>
          ) : (
            <div className="table-responsive">
              <Table hover className="align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th className="ps-4 text-secondary small fw-bold text-uppercase text-nowrap py-3" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>Company</th>
                    <th className="text-secondary small fw-bold text-uppercase text-nowrap py-3" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>HR Owner</th>
                    <th className="text-secondary small fw-bold text-uppercase text-nowrap py-3" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>Onboarding Code</th>
                    <th className="text-secondary small fw-bold text-uppercase text-nowrap py-3" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>Workforce</th>
                    <th className="text-secondary small fw-bold text-uppercase text-nowrap py-3" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>Today Check-ins</th>
                    <th className="text-secondary small fw-bold text-uppercase text-nowrap py-3" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>Plan Tier</th>
                    <th className="pe-4 text-secondary small fw-bold text-uppercase text-nowrap text-end py-3" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrganizations.slice(0, 10).map((org) => (
                    <tr key={org.id}>
                      <td className="ps-4 text-nowrap py-3">
                        <div className="d-flex align-items-center gap-3">
                          <div
                            className="rounded-3 bg-primary-subtle text-primary fw-bold d-flex align-items-center justify-content-center flex-shrink-0"
                            style={{ width: 38, height: 38, fontSize: "14px" }}
                          >
                            {org.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="fw-bold text-dark fs-6 text-truncate" style={{ maxWidth: 220 }} title={org.name}>
                              {org.name}
                            </div>
                            <div className="d-flex align-items-center gap-1.5 mt-0.5">
                              <span className="badge bg-secondary-subtle text-dark border px-1.5 py-0.5 fw-semibold" style={{ fontSize: "10.5px" }}>
                                ID #{org.id}
                              </span>
                              <span className="text-secondary small" style={{ fontSize: "11px" }}>
                                Tenant
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="text-nowrap py-3">
                        <div>
                          <span className="fw-semibold text-dark d-block" style={{ fontSize: "13.5px" }}>
                            {org.owner_name || "Unassigned"}
                          </span>
                          <span className="text-secondary small" style={{ fontSize: "12px" }}>
                            {org.owner_email || "No email linked"}
                          </span>
                        </div>
                      </td>
                      <td className="text-nowrap py-3">
                        <div className="d-inline-flex align-items-center gap-2 px-2.5 py-1 bg-body-tertiary rounded-2 border">
                          <code className="fw-bold text-primary font-monospace text-nowrap" style={{ fontSize: "12.5px", letterSpacing: "0.5px" }}>
                            {org.invite_code}
                          </code>
                          <button
                            type="button"
                            className="btn btn-sm btn-link p-0 text-secondary border-0 text-decoration-none"
                            onClick={() => copyInviteCode(org.invite_code)}
                            title="Copy Onboarding Code"
                            style={{ lineHeight: 1 }}
                          >
                            {copiedCode === org.invite_code ? (
                              <IconCheck size={14} className="text-success" />
                            ) : (
                              <IconCopy size={14} className="text-secondary opacity-75" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="text-nowrap py-3">
                        <div className="d-flex align-items-baseline gap-1.5">
                          <span className="fw-bold text-dark fs-6">{org.employee_count}</span>
                          <span className="text-secondary small">({org.active_employee_count} active)</span>
                        </div>
                      </td>
                      <td className="text-nowrap py-3">
                        <Badge
                          bg="info-subtle"
                          text="info"
                          className="border border-info-subtle px-2.5 py-1 fw-semibold text-nowrap"
                          style={{ fontSize: "12px" }}
                        >
                          {org.today_attendance_count} present
                        </Badge>
                      </td>
                      <td className="text-nowrap py-3">
                        <Badge bg="light" text="dark" className="border px-2 py-1 fw-medium" style={{ fontSize: "11.5px" }}>
                          {org.plan_name || "Standard Plan"}
                        </Badge>
                      </td>
                      <td className="pe-4 text-end text-nowrap py-3">
                        <Badge
                          bg={org.is_active ? "success-subtle" : "danger-subtle"}
                          text={org.is_active ? "success" : "danger"}
                          className={`border ${org.is_active ? "border-success-subtle" : "border-danger-subtle"} px-2.5 py-1 rounded-pill fw-semibold`}
                          style={{ fontSize: "11.5px" }}
                        >
                          ● {org.is_active ? "Active" : "Suspended"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card.Body>
      </Card>

      {/* Onboard Company Modal */}
      <Modal show={showOnboardModal} onHide={() => setShowOnboardModal(false)} centered>
        <Modal.Header closeButton className="border-0 pb-0">
          <Modal.Title className="fw-bold">Onboard New Company Tenant</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleOnboardSubmit}>
          <Modal.Body className="pt-3">
            {onboardSuccessMsg && (
              <Alert variant="success" className="py-2 small">
                {onboardSuccessMsg}
              </Alert>
            )}
            <Form.Group className="mb-3">
              <Form.Label className="small fw-semibold text-secondary">Company Name</Form.Label>
              <Form.Control
                type="text"
                placeholder="e.g. Acme Corporation Pvt. Ltd."
                value={onboardName}
                onChange={(e) => setOnboardName(e.target.value)}
                required
              />
            </Form.Group>
            <p className="text-secondary small mb-0">
              An onboarding access code will be generated automatically. You can then assign an HR administrator.
            </p>
          </Modal.Body>
          <Modal.Footer className="border-0 pt-0">
            <Button variant="light" size="sm" onClick={() => setShowOnboardModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" disabled={onboardLoading}>
              {onboardLoading ? <Spinner size="sm" /> : "Onboard Organization"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Create HR Administrator Modal */}
      <Modal show={showAdminModal} onHide={() => setShowAdminModal(false)} centered>
        <Modal.Header closeButton className="border-0 pb-0">
          <Modal.Title className="fw-bold">Assign HR Administrator</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleAdminSubmit}>
          <Modal.Body className="pt-3">
            {adminSuccessMsg && (
              <Alert variant="success" className="py-2 small">
                {adminSuccessMsg}
              </Alert>
            )}
            <Form.Group className="mb-3">
              <Form.Label className="small fw-semibold text-secondary">Target Company</Form.Label>
              <Form.Select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                required
              >
                <option value="">-- Choose Tenant Company --</option>
                {(data?.organizations || []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} (Code: {o.invite_code})
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="small fw-semibold text-secondary">Admin Full Name</Form.Label>
              <Form.Control
                type="text"
                placeholder="e.g. John Doe"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="small fw-semibold text-secondary">Admin Email Address</Form.Label>
              <Form.Control
                type="email"
                placeholder="admin@company.com"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="small fw-semibold text-secondary">Temporary Password</Form.Label>
              <Form.Control
                type="password"
                placeholder="Minimum 8 characters"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                required
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer className="border-0 pt-0">
            <Button variant="light" size="sm" onClick={() => setShowAdminModal(false)}>
              Cancel
            </Button>
            <Button variant="warning" size="sm" type="submit" className="text-dark fw-bold" disabled={adminLoading}>
              {adminLoading ? <Spinner size="sm" /> : "Create & Assign HR Owner"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
}
