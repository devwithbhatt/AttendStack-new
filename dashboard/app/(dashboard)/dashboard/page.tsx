"use client";

import { Fragment, useEffect, useState, useMemo } from "react";
import { Badge, Card, Col, Row, Table, Spinner, Button, Modal } from "react-bootstrap";
import { IconUsers, IconListCheck, IconClock, IconSnowboarding, IconRefresh, IconBuildingBank, IconCopy, IconCheck, IconExternalLink, IconChartPie, IconKey, IconShieldLock } from "@tabler/icons-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import UpcomingIncrementsChartWidget from "components/UpcomingIncrementsChartWidget";
import ProjectDeliveryOverviewWidget from "components/dashboard/ProjectDeliveryOverviewWidget";
import { ApexOptions } from "apexcharts";

// SSR safe dynamic import for ApexCharts
const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

const BASE_URL = `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1`;

const DEPT_COLORS = ["#4f46e5", "#10b981", "#06b6d4", "#f59e0b", "#8b5cf6", "#ec4899", "#3b82f6", "#14b8a6"];

const authHeaders = (): HeadersInit => {
  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const formatDate = (value?: string | null) => {
  if (!value) return "--";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

const formatTime = (value?: string | null) => {
  if (!value) return "--";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(date);
};

const DashboardPage = () => {
  const [todayRecords, setTodayRecords] = useState<any[]>([]);
  const [recentEmployees, setRecentEmployees] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = async () => {
    setIsLoading(true);
    setError("");
    try {
      // 1. Fetch today's live status for stats & check-ins
      const todayRes = await fetch(`${BASE_URL}/attendance/today/`, { headers: authHeaders() });
      if (!todayRes.ok) throw new Error("Failed to load today's statistics.");
      const todayData = await todayRes.json();
      setTodayRecords(todayData);

      // 2. Fetch recent employees
      const empRes = await fetch(`${BASE_URL}/employees/?ordering=-joining_date&limit=5`, { headers: authHeaders() });
      if (empRes.ok) {
        const empData = await empRes.json();
        setRecentEmployees(Array.isArray(empData) ? empData : empData.results || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard data.");
    } finally {
      setIsLoading(false);
    }
  };

  const [organization, setOrganization] = useState<any>(null);

  const fetchOrg = async () => {
    try {
      let orgData: any = null;

      // 1. Try local storage cache first
      if (typeof window !== "undefined") {
        const cachedOrgStr = localStorage.getItem("organization");
        if (cachedOrgStr) {
          try {
            orgData = JSON.parse(cachedOrgStr);
          } catch {
            // Ignore parse error
          }
        }
      }

      // 2. Query direct user workspace organization from backend
      try {
        const meRes = await fetch(`${BASE_URL}/organizations/me/`, { headers: authHeaders() });
        if (meRes.ok) {
          orgData = await meRes.json();
        }
      } catch {
        // Fallback to list query
      }

      if (!orgData || !orgData.id) {
        const res = await fetch(`${BASE_URL}/organizations/?scope=me`, { headers: authHeaders() });
        if (res.ok) {
          const data = await res.json();
          const orgs = Array.isArray(data) ? data : data.results || [];
          if (orgs.length > 0) {
            orgData = orgs[0];
          }
        }
      }

      // 3. Fallback list query with smart filtering
      if (!orgData || !orgData.id) {
        const fallbackRes = await fetch(`${BASE_URL}/organizations/`, { headers: authHeaders() });
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          const orgs = Array.isArray(fallbackData) ? fallbackData : fallbackData.results || [];
          if (orgs.length > 0) {
            const storedUserStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
            const storedUser = storedUserStr ? JSON.parse(storedUserStr) : null;
            const userEmail = storedUser?.email?.toLowerCase() || "";

            orgData =
              (userEmail && orgs.find((o: any) => o.owner_email && o.owner_email.toLowerCase() === userEmail)) ||
              orgs.find((o: any) => (o.name || "").toLowerCase().includes("bhatt")) ||
              orgs[0];
          }
        }
      }

      if (orgData) {
        setOrganization(orgData);
        if (typeof window !== "undefined") {
          localStorage.setItem("organization", JSON.stringify(orgData));
        }
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    fetchData();
    fetchOrg();
  }, []);

  // Personalized dynamic greeting
  const greeting = useMemo(() => {
    const hrs = new Date().getHours();
    if (hrs < 12) return "Good morning";
    if (hrs < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const isRecordPresent = (r: any) =>
    Boolean(r.check_in) ||
    ["Present", "Clocked In", "Clocked Out", "Half Day", "Half-day", "Late", "Late Entry"].includes(r.live_status) ||
    ["PRESENT", "LATE", "HALF_DAY"].includes(r.status);

  const isRecordLate = (r: any) =>
    ["Late", "Late Entry"].includes(r.live_status) || r.status === "LATE";

  const isRecordOnLeave = (r: any) =>
    ["Leave", "Paid Leave", "On Leave"].includes(r.live_status) ||
    ["LEAVE", "PAID_LEAVE"].includes(r.status);

  // Compute live KPIs
  const stats = useMemo(() => {
    const total = todayRecords.length;
    const present = todayRecords.filter(isRecordPresent).length;
    const late = todayRecords.filter(isRecordLate).length;
    const onLeave = todayRecords.filter(isRecordOnLeave).length;
    const onTimePresent = Math.max(present - late, 0);
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;

    return {
      total,
      present,
      onTimePresent,
      late,
      onLeave,
      rate,
    };
  }, [todayRecords]);

  // Compute department distribution and attendance data for table & chart
  const departmentStats = useMemo(() => {
    const summary: Record<string, { total: number; present: number; absent: number; leave: number }> = {};
    todayRecords.forEach((r) => {
      const dept = r.employee_department || "General";
      if (!summary[dept]) {
        summary[dept] = { total: 0, present: 0, absent: 0, leave: 0 };
      }
      summary[dept].total += 1;
      if (isRecordPresent(r)) {
        summary[dept].present += 1;
      } else if (isRecordOnLeave(r)) {
        summary[dept].leave += 1;
      } else {
        summary[dept].absent += 1;
      }
    });

    return Object.entries(summary).map(([name, counts]) => ({
      name,
      ...counts,
    }));
  }, [todayRecords]);

  // Donut Chart arrays
  const chartSeries = useMemo(() => departmentStats.map((d) => d.total), [departmentStats]);
  const chartLabels = useMemo(() => departmentStats.map((d) => d.name), [departmentStats]);

  const chartOptions: ApexOptions = {
    chart: {
      type: "donut",
      toolbar: { show: false },
      fontFamily: "Inter, sans-serif",
    },
    labels: chartLabels,
    colors: departmentStats.map((_, i) => DEPT_COLORS[i % DEPT_COLORS.length]),
    legend: {
      show: false, // Clean custom legend tags rendered underneath to prevent layout cut-off
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      width: 3,
      colors: ["#ffffff"],
    },
    plotOptions: {
      pie: {
        donut: {
          size: "72%",
          labels: {
            show: true,
            name: {
              show: true,
              fontSize: "12px",
              fontWeight: 600,
              color: "#64748b",
              offsetY: -4,
            },
            value: {
              show: true,
              fontSize: "24px",
              fontWeight: 700,
              color: "#1e293b",
              offsetY: 6,
              formatter: (val) => String(val),
            },
            total: {
              show: true,
              label: "Workforce",
              fontSize: "12px",
              fontWeight: 600,
              color: "#64748b",
              formatter: () => String(stats.total),
            },
          },
        },
      },
    },
    tooltip: {
      y: {
        formatter: (val: number) => `${val} staff members`,
      },
    },
  };

  const absentCount = Math.max(stats.total - stats.present - stats.onLeave, 0);

  const attendanceChartSeries = [
    {
      name: "Employees",
      data: [stats.onTimePresent, stats.late, stats.onLeave, absentCount],
    },
  ];

  const attendanceChartOptions: ApexOptions = {
    chart: {
      type: "bar",
      toolbar: { show: false },
      fontFamily: "Inter, sans-serif",
    },
    plotOptions: {
      bar: {
        borderRadius: 8,
        columnWidth: "40%",
        distributed: true,
        dataLabels: {
          position: "top",
        },
      },
    },
    colors: ["#10b981", "#f59e0b", "#06b6d4", "#ef4444"],
    dataLabels: {
      enabled: true,
      offsetY: -20,
      style: {
        fontSize: "12px",
        colors: ["#374151"],
      },
    },
    xaxis: {
      categories: ["Present", "Late Entries", "On Leave", "Absent"],
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: {
          fontSize: "13px",
          fontWeight: 600,
        },
      },
    },
    yaxis: {
      labels: {
        show: true,
      },
    },
    grid: {
      borderColor: "#f1f5f9",
      strokeDashArray: 4,
    },
    legend: {
      show: false,
    },
    tooltip: {
      y: {
        formatter: (val: number) => `${val} employees`,
      },
    },
  };

  // Compute recent activity: Checked in employees sorted by check_in time descending
  const recentActivities = useMemo(() => {
    return todayRecords
      .filter((r) => r.check_in)
      .sort((a, b) => new Date(b.check_in).getTime() - new Date(a.check_in).getTime())
      .slice(0, 5)
      .map((r) => {
        const isLate = ["Late", "Late Entry"].includes(r.live_status) || r.status === "LATE";
        const isHalfDay = ["Half Day", "Half-day"].includes(r.live_status) || r.status === "HALF_DAY";
        
        const colorClass = isLate ? "warning" : isHalfDay ? "info" : "success";
        const badgeText = isLate ? "Late Entry" : isHalfDay ? "Half Day" : "On Time";

        return {
          employeeName: r.employee_name || "Employee",
          department: r.employee_department || "General",
          timestamp: formatTime(r.check_in),
          colorClass,
          badgeText,
        };
      });
  }, [todayRecords]);

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: "400px" }}>
        <Spinner animation="border" variant="primary" role="status">
          <span className="visually-hidden">Loading dashboard...</span>
        </Spinner>
      </div>
    );
  }

  return (
    <Fragment>
      {/* Dynamic inline premium styles */}
      <style>{`
        .stat-card {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .stat-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 16px rgba(0,0,0,0.06) !important;
        }
        .activity-item {
          transition: background-color 0.2s ease;
        }
        .activity-item:hover {
          background-color: rgba(0, 0, 0, 0.015);
        }
        .activity-item:hover .activity-dot {
          transform: scale(1.3);
        }
        .activity-dot {
          transition: transform 0.25s ease;
        }
      `}</style>

      <div className="d-flex justify-content-between align-items-center mb-6">
        <div>
          <h2 className="mb-0 fw-bold">{greeting}, Admin</h2>
          <p className="text-secondary mb-0">Overview of company workforce, attendance, and recent activities.</p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              const simplyJobUrl = process.env.NEXT_PUBLIC_SIMPLYJOB_URL || (typeof window !== "undefined" && window.location.hostname === "localhost" ? "http://localhost:3009" : "https://simplyjob.in");
              window.open(`${simplyJobUrl}/company/hired-employees`, "_blank");
            }}
            className="d-flex align-items-center gap-2 px-3 shadow-sm fw-semibold"
          >
            <IconExternalLink size={16} /> Open SimplyJob
          </Button>
          <Button variant="outline-primary" size="sm" onClick={fetchData} className="d-flex align-items-center gap-2 px-3 shadow-sm">
            <IconRefresh size={16} /> Sync Data
          </Button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {/* Stats row */}
      <Row className="g-6 mb-6">
        {/* Total Employees */}
        <Col xl={3} md={6}>
          <Card className="card-lg bg-light-primary border-0 stat-card">
            <Card.Body className="d-flex flex-column gap-6">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="fw-semibold text-dark">Total Employees</div>
                </div>
                <div className="text-primary"><IconUsers size={24} strokeWidth={1.5} /></div>
              </div>
              <div className="lh-1 d-flex flex-column gap-2">
                <div className="fs-1 fw-bold text-dark">{stats.total}</div>
                <p className="mb-0 small">
                  <span className="text-primary me-1 fw-semibold">Active</span>
                  <span className="text-secondary">Workforce</span>
                </p>
              </div>
            </Card.Body>
          </Card>
        </Col>

        {/* Attendance Rate */}
        <Col xl={3} md={6}>
          <Card className="card-lg bg-light-success border-0 stat-card">
            <Card.Body className="d-flex flex-column gap-6">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="fw-semibold text-dark">Attendance Rate</div>
                </div>
                <div className="text-success"><IconListCheck size={24} strokeWidth={1.5} /></div>
              </div>
              <div className="lh-1 d-flex flex-column gap-2">
                <div className="fs-1 fw-bold text-dark">{stats.rate}%</div>
                <p className="mb-0 small">
                  <span className="text-success me-1 fw-semibold">{stats.present}/{stats.total}</span>
                  <span className="text-secondary">Present today</span>
                </p>
              </div>
            </Card.Body>
          </Card>
        </Col>

        {/* Late Entries */}
        <Col xl={3} md={6}>
          <Card className="card-lg bg-light-warning border-0 stat-card">
            <Card.Body className="d-flex flex-column gap-6">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="fw-semibold text-dark">Late Entries</div>
                </div>
                <div className="text-warning"><IconClock size={24} strokeWidth={1.5} /></div>
              </div>
              <div className="lh-1 d-flex flex-column gap-2">
                <div className="fs-1 fw-bold text-dark">{stats.late}</div>
                <p className="mb-0 small">
                  <span className="text-warning me-1 fw-semibold">After 10:00 AM</span>
                  <span className="text-secondary">cutoff</span>
                </p>
              </div>
            </Card.Body>
          </Card>
        </Col>

        {/* On Leave Today */}
        <Col xl={3} md={6}>
          <Card className="card-lg bg-light-info border-0 stat-card">
            <Card.Body className="d-flex flex-column gap-6">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="fw-semibold text-dark">On Leave Today</div>
                </div>
                <div className="text-info"><IconSnowboarding size={24} strokeWidth={1.5} /></div>
              </div>
              <div className="lh-1 d-flex flex-column gap-2">
                <div className="fs-1 fw-bold text-dark">{stats.onLeave}</div>
                <p className="mb-0 small">
                  <span className="text-info me-1 fw-semibold">Approved</span>
                  <span className="text-secondary">time-off today</span>
                </p>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Project Delivery Overview & Live Tasks Section */}
      <ProjectDeliveryOverviewWidget />

      <Row className="g-6 mb-6">
        {/* Left column: Recent Joiners & workforce breakdown chart */}
        <Col xl={8}>
          {/* Workforce Distribution Chart & Breakdown Card */}
          <Card className="border-0 shadow-sm mb-6 overflow-hidden">
            <Card.Header className="bg-white py-3.5 px-4 d-flex justify-content-between align-items-center flex-wrap gap-2 border-bottom">
              <div className="d-flex align-items-center gap-2.5">
                <div className="p-2 rounded-3 bg-primary-subtle text-primary d-flex align-items-center justify-content-center">
                  <IconChartPie size={20} />
                </div>
                <div>
                  <h5 className="mb-0 fw-bold text-dark fs-5">Workforce Department Analytics</h5>
                  <small className="text-secondary">Real-time team distribution and attendance health</small>
                </div>
              </div>
              <Badge bg="primary-subtle" className="text-primary fw-semibold px-3 py-1.5 rounded-pill fs-7">
                {departmentStats.length} {departmentStats.length === 1 ? "Department" : "Departments"}
              </Badge>
            </Card.Header>
            <Card.Body className="p-4">
              {chartSeries.length > 0 ? (
                <Row className="align-items-center g-4">
                  {/* Left: Donut Chart with clean center */}
                  <Col lg={5} className="d-flex flex-column align-items-center justify-content-center">
                    <div style={{ width: "100%", maxWidth: "260px" }}>
                      <Chart options={chartOptions} series={chartSeries} type="donut" height={250} />
                    </div>
                    {/* Clean custom legend tags underneath chart */}
                    <div className="d-flex flex-wrap justify-content-center gap-2 mt-2">
                      {departmentStats.map((dept, i) => (
                        <div
                          key={dept.name}
                          className="d-flex align-items-center gap-1.5 px-2.5 py-1 rounded-pill bg-light border text-secondary small fw-medium"
                        >
                          <span
                            className="rounded-circle d-inline-block"
                            style={{
                              width: "8px",
                              height: "8px",
                              backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length],
                            }}
                          />
                          <span>{dept.name}</span>
                          <span className="fw-bold text-dark">({dept.total})</span>
                        </div>
                      ))}
                    </div>
                  </Col>

                  {/* Right: Modern Department Cards / Breakdown without overflow */}
                  <Col lg={7}>
                    <div className="d-flex flex-column gap-2.5">
                      {departmentStats.map((dept, index) => {
                        const color = DEPT_COLORS[index % DEPT_COLORS.length];
                        const presentPct = dept.total > 0 ? Math.round((dept.present / dept.total) * 100) : 0;
                        const pctOfTotal = stats.total > 0 ? Math.round((dept.total / stats.total) * 100) : 0;

                        return (
                          <div
                            key={dept.name}
                            className="p-3 rounded-3 border bg-light-subtle shadow-none"
                          >
                            <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-1">
                              <div className="d-flex align-items-center gap-2">
                                <span
                                  className="rounded-circle d-inline-block flex-shrink-0"
                                  style={{
                                    width: "10px",
                                    height: "10px",
                                    backgroundColor: color,
                                  }}
                                />
                                <span className="fw-bold text-dark fs-6">{dept.name}</span>
                                <Badge bg="light" className="text-secondary border fw-medium px-2 py-0.5" style={{ fontSize: "11px" }}>
                                  {dept.total} staff • {pctOfTotal}% of total
                                </Badge>
                              </div>
                              <span className="small fw-semibold text-dark">
                                {presentPct}% Active Today
                              </span>
                            </div>

                            {/* Mini Multi-segment Attendance Progress Bar */}
                            <div className="progress mb-2" style={{ height: "6px", backgroundColor: "#e2e8f0" }}>
                              <div
                                className="progress-bar bg-success"
                                style={{ width: `${(dept.present / dept.total) * 100}%` }}
                                title={`${dept.present} Present`}
                              />
                              <div
                                className="progress-bar bg-warning"
                                style={{ width: `${(dept.leave / dept.total) * 100}%` }}
                                title={`${dept.leave} On Leave`}
                              />
                              <div
                                className="progress-bar bg-danger"
                                style={{ width: `${(dept.absent / dept.total) * 100}%` }}
                                title={`${dept.absent} Absent`}
                              />
                            </div>

                            {/* Status tags row */}
                            <div className="d-flex align-items-center justify-content-between text-secondary" style={{ fontSize: "12px" }}>
                              <div className="d-flex align-items-center gap-3">
                                <span className="text-success fw-semibold">
                                  ● {dept.present} Present
                                </span>
                                {dept.leave > 0 && (
                                  <span className="text-warning fw-semibold">
                                    ● {dept.leave} Leave
                                  </span>
                                )}
                                {dept.absent > 0 && (
                                  <span className="text-danger fw-semibold">
                                    ● {dept.absent} Absent
                                  </span>
                                )}
                              </div>
                              <span className="text-muted">
                                Total: {dept.total}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Col>
                </Row>
              ) : (
                <div className="text-muted text-center py-5">No workforce analytics available.</div>
              )}
            </Card.Body>
          </Card>

          {/* Today's Attendance Overview Graph Card */}
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-white d-flex justify-content-between align-items-center py-4">
              <div>
                <h5 className="mb-0 fw-bold">Today's Attendance Overview</h5>
                <small className="text-secondary">Interactive bar graph showing live attendance breakdown</small>
              </div>
              <Link href="/attendance" className="btn btn-outline-primary btn-sm px-3">
                View Detailed Records
              </Link>
            </Card.Header>
            <Card.Body className="pt-2 pb-4">
              <Chart
                options={attendanceChartOptions}
                series={attendanceChartSeries}
                type="bar"
                height={280}
              />
            </Card.Body>
          </Card>
        </Col>

        {/* Right column: Recent activities feed */}
        <Col xl={4}>
          <Card className="border-0 shadow-sm h-100 d-flex flex-column">
            <Card.Header className="bg-white py-3.5 px-4 d-flex justify-content-between align-items-center border-bottom">
              <div className="d-flex align-items-center gap-2">
                <div className="p-1.5 rounded-3 bg-success-subtle text-success d-flex align-items-center justify-content-center">
                  <IconClock size={18} />
                </div>
                <div>
                  <h5 className="mb-0 fw-bold text-dark fs-6">Today's Activity Feed</h5>
                  <small className="text-secondary" style={{ fontSize: "11px" }}>Real-time check-in stream</small>
                </div>
              </div>
              <Badge bg="success-subtle" className="text-success fw-semibold px-2.5 py-1 rounded-pill" style={{ fontSize: "11px" }}>
                <span className="d-inline-block rounded-circle bg-success me-1.5" style={{ width: "6px", height: "6px" }} />
                Live
              </Badge>
            </Card.Header>
            <Card.Body className="p-4 d-flex flex-column justify-content-between flex-grow-1">
              <div>
                {recentActivities.length === 0 ? (
                  <div className="text-center py-5 text-muted">
                    <IconClock size={32} className="text-secondary opacity-50 mb-2" />
                    <p className="mb-0 small">No check-in activities recorded today yet.</p>
                  </div>
                ) : (
                  <div className="position-relative">
                    {/* Vertical timeline connector line */}
                    <div
                      className="position-absolute"
                      style={{
                        top: "14px",
                        bottom: "20px",
                        left: "15px",
                        width: "2px",
                        backgroundColor: "#f1f5f9",
                        zIndex: 0,
                      }}
                    />

                    <div className="d-flex flex-column gap-2 position-relative" style={{ zIndex: 1 }}>
                      {recentActivities.map((act, index) => (
                        <div
                          key={index}
                          className="d-flex align-items-center justify-content-between p-2 rounded-3 bg-light-subtle border border-transparent transition-all"
                          style={{ transition: "all 0.15s ease" }}
                        >
                          <div className="d-flex align-items-center gap-2.5 min-w-0">
                            {/* Avatar or initial with status badge */}
                            <div className="position-relative flex-shrink-0">
                              <div
                                className="rounded-circle d-flex align-items-center justify-content-center fw-bold text-white shadow-sm"
                                style={{
                                  width: "30px",
                                  height: "30px",
                                  backgroundColor:
                                    act.colorClass === "warning"
                                      ? "#f59e0b"
                                      : act.colorClass === "info"
                                      ? "#06b6d4"
                                      : "#10b981",
                                  fontSize: "12px",
                                }}
                              >
                                {act.employeeName.charAt(0).toUpperCase()}
                              </div>
                              <span
                                className={`position-absolute bottom-0 end-0 rounded-circle border border-white bg-${act.colorClass}`}
                                style={{ width: "9px", height: "9px" }}
                              />
                            </div>

                            {/* Name & department info */}
                            <div className="min-w-0">
                              <div className="fw-semibold text-dark text-truncate" style={{ fontSize: "13px", lineHeight: "1.25" }}>
                                {act.employeeName}
                              </div>
                              <div className="d-flex align-items-center gap-1.5 text-secondary" style={{ fontSize: "11px", lineHeight: "1.2" }}>
                                <span className="text-muted">Checked in</span>
                                <span>•</span>
                                <span className="text-muted text-truncate">{act.department}</span>
                              </div>
                            </div>
                          </div>

                          {/* Time & status badge */}
                          <div className="text-end flex-shrink-0 ms-2">
                            <span className="badge bg-white text-secondary border fw-medium px-2 py-0.5" style={{ fontSize: "11px" }}>
                              {act.timestamp}
                            </span>
                            {act.badgeText !== "On Time" && (
                              <div className="mt-0.5">
                                <span className={`badge bg-${act.colorClass}-subtle text-${act.colorClass} px-1.5 py-0.2`} style={{ fontSize: "9.5px" }}>
                                  {act.badgeText}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 mt-auto">
                <Link
                  href="/attendance"
                  className="btn btn-outline-primary w-100 py-1.5 d-flex align-items-center justify-content-center gap-1.5 fw-semibold shadow-none"
                  style={{ fontSize: "12.5px" }}
                >
                  View Live Attendance Feed <IconExternalLink size={14} />
                </Link>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Upcoming Employee Salary Increments Strategy Line Chart */}
      <UpcomingIncrementsChartWidget />
    </Fragment>
  );
};

export default DashboardPage;
