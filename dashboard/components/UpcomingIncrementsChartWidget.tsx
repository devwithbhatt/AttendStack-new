"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, Row, Col, Badge, ButtonGroup, Button, Spinner, Alert } from "react-bootstrap";
import { IconTrendingUp, IconCalendarTime, IconCurrencyRupee, IconUserCheck, IconArrowUpRight } from "@tabler/icons-react";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";

// Dynamically import ApexCharts to avoid SSR hydration issues
const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

const BASE_URL = `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1`;

const authHeaders = (): HeadersInit => {
  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  return token
    ? {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      }
    : { "Content-Type": "application/json" };
};

export interface ChartMonthSeries {
  month_key: string;
  month_label: string;
  employee_count: number;
  total_raise_amount: number;
  employees: {
    id: string;
    full_name: string;
    due_date: string;
    raise_amount: number;
    new_salary: number;
  }[];
}

export interface ChartProjectionsResponse {
  months_ahead: number;
  total_upcoming_count: number;
  total_upcoming_raise: number;
  next_month: {
    label: string;
    employee_count: number;
    total_raise_amount: number;
    employees: { id: string; full_name: string; due_date: string; raise_amount: number }[];
  };
  series: ChartMonthSeries[];
}

const UpcomingIncrementsChartWidget: React.FC = () => {
  const [data, setData] = useState<ChartProjectionsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [monthsAhead, setMonthsAhead] = useState<number>(6);

  const fetchChartData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${BASE_URL}/payroll/increments/chart-projections/?months=${monthsAhead}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load increment chart projections.");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading increment chart.");
    } finally {
      setLoading(false);
    }
  }, [monthsAhead]);

  useEffect(() => {
    fetchChartData();
  }, [fetchChartData]);

  const categories = data?.series?.map((s) => s.month_label) || [];
  const countSeriesData = data?.series?.map((s) => s.employee_count) || [];
  const raiseSeriesData = data?.series?.map((s) => Math.round(s.total_raise_amount)) || [];

  const chartOptions: ApexOptions = {
    chart: {
      type: "area",
      height: 320,
      fontFamily: "Inter, sans-serif",
      toolbar: { show: false },
      zoom: { enabled: false },
    },
    colors: ["#0d9488", "#2563eb"],
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.45,
        opacityTo: 0.05,
        stops: [0, 95, 100],
      },
    },
    stroke: {
      curve: "smooth",
      width: [3, 2],
      dashArray: [0, 4],
    },
    dataLabels: { enabled: false },
    xaxis: {
      categories: categories,
      labels: {
        style: {
          colors: "#64748b",
          fontSize: "12px",
          fontWeight: 600,
        },
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: [
      {
        title: {
          text: "Employees Due",
          style: { color: "#0d9488", fontSize: "12px", fontWeight: 600 },
        },
        labels: {
          formatter: (val) => Math.round(val).toString(),
          style: { colors: "#0d9488" },
        },
        min: 0,
      },
      {
        opposite: true,
        title: {
          text: "Estimated Raise (₹)",
          style: { color: "#2563eb", fontSize: "12px", fontWeight: 600 },
        },
        labels: {
          formatter: (val) => `₹${Number(val).toLocaleString("en-IN")}`,
          style: { colors: "#2563eb" },
        },
        min: 0,
      },
    ],
    grid: {
      borderColor: "#f1f5f9",
      strokeDashArray: 4,
    },
    tooltip: {
      shared: true,
      intersect: false,
      y: [
        {
          formatter: (val) => `${val} Employee${val === 1 ? "" : "s"}`,
        },
        {
          formatter: (val) => `₹${Number(val).toLocaleString("en-IN")}`,
        },
      ],
    },
    legend: {
      position: "top",
      horizontalAlign: "right",
      fontSize: "13px",
      fontWeight: 600,
      markers: {
        size: 6,
      },
    },
  };

  const chartSeries = [
    {
      name: "Employees Due for Increment",
      type: "area",
      data: countSeriesData,
    },
    {
      name: "Total Raise Amount (₹)",
      type: "line",
      data: raiseSeriesData,
    },
  ];

  return (
    <Card className="border-0 shadow-sm mb-4">
      <Card.Header className="bg-white py-3.5 border-0 d-flex flex-wrap align-items-center justify-content-between gap-3">
        <div className="d-flex align-items-center gap-2.5">
          <div
            className="rounded-circle bg-emerald-100 text-emerald-700 d-flex align-items-center justify-content-center"
            style={{ width: "42px", height: "42px", backgroundColor: "#ccfbf1", color: "#0f766e" }}
          >
            <IconTrendingUp size={22} />
          </div>
          <div>
            <div className="d-flex align-items-center gap-2">
              <h5 className="mb-0 fw-bold text-dark">Upcoming Employee Increments Strategy</h5>
              <Badge bg="success-subtle" className="text-success border border-success-subtle rounded-pill px-2.5 py-1">
                Active Staff Trajectory
              </Badge>
            </div>
            <p className="text-muted small mb-0 mt-0.5">
              Month-by-month trajectory of scheduled salary raises and projected payroll growth for active employees.
            </p>
          </div>
        </div>

        <ButtonGroup size="sm">
          <Button
            variant={monthsAhead === 6 ? "primary" : "outline-secondary"}
            onClick={() => setMonthsAhead(6)}
            className="fw-semibold px-3"
          >
            Next 6 Months
          </Button>
          <Button
            variant={monthsAhead === 12 ? "primary" : "outline-secondary"}
            onClick={() => setMonthsAhead(12)}
            className="fw-semibold px-3"
          >
            Next 12 Months
          </Button>
        </ButtonGroup>
      </Card.Header>

      <Card.Body className="pt-2 pb-4 px-4">
        {error && <Alert variant="danger" className="mb-3">{error}</Alert>}

        {loading ? (
          <div className="text-center py-5">
            <Spinner animation="border" variant="primary" className="mb-2" />
            <p className="text-muted small mb-0">Calculating upcoming increment trajectory...</p>
          </div>
        ) : (
          <>
            {/* Strategy Highlights Row */}
            <Row className="g-3 mb-4">
              <Col xs={12} sm={4}>
                <div className="p-3 rounded-3 border bg-light-subtle h-100">
                  <div className="d-flex align-items-center gap-2 mb-1 text-teal">
                    <IconCalendarTime size={18} className="text-teal" style={{ color: "#0d9488" }} />
                    <span className="small fw-bold text-uppercase text-secondary">
                      Next Month ({data?.next_month?.label || "Upcoming"})
                    </span>
                  </div>
                  <h4 className="fw-bold mb-0 text-dark">
                    {data?.next_month?.employee_count || 0}{" "}
                    <small className="fs-6 fw-normal text-muted">Employees Due</small>
                  </h4>
                  <small className="text-success fw-semibold d-block mt-1">
                    +₹{Number(data?.next_month?.total_raise_amount || 0).toLocaleString("en-IN")} projected raise
                  </small>
                </div>
              </Col>

              <Col xs={12} sm={4}>
                <div className="p-3 rounded-3 border bg-light-subtle h-100">
                  <div className="d-flex align-items-center gap-2 mb-1 text-primary">
                    <IconUserCheck size={18} className="text-primary" />
                    <span className="small fw-bold text-uppercase text-secondary">
                      Total Due ({monthsAhead} Months)
                    </span>
                  </div>
                  <h4 className="fw-bold mb-0 text-dark">
                    {data?.total_upcoming_count || 0}{" "}
                    <small className="fs-6 fw-normal text-muted">Total Increments</small>
                  </h4>
                  <small className="text-muted d-block mt-1">Scheduled for performance review</small>
                </div>
              </Col>

              <Col xs={12} sm={4}>
                <div className="p-3 rounded-3 border bg-light-subtle h-100">
                  <div className="d-flex align-items-center gap-2 mb-1 text-success">
                    <IconCurrencyRupee size={18} className="text-success" />
                    <span className="small fw-bold text-uppercase text-secondary">
                      Projected Payroll Growth
                    </span>
                  </div>
                  <h4 className="fw-bold mb-0 text-success">
                    +₹{Number(data?.total_upcoming_raise || 0).toLocaleString("en-IN")}
                  </h4>
                  <small className="text-muted d-block mt-1">
                    Added to annual payroll across {monthsAhead} months
                  </small>
                </div>
              </Col>
            </Row>

            {/* Line Chart */}
            <div className="increment-line-chart-wrapper bg-white rounded-3 p-2 border">
              <Chart options={chartOptions} series={chartSeries} type="area" height={320} />
            </div>

            {/* Next Month Featured Preview */}
            {data?.next_month?.employees && data.next_month.employees.length > 0 && (
              <div className="mt-3.5 p-3 rounded-3 border border-emerald-200" style={{ backgroundColor: "#f0fdf4" }}>
                <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                  <div className="d-flex align-items-center gap-2">
                    <IconArrowUpRight size={18} className="text-success" />
                    <strong className="text-dark small">
                      Employees with Next Month Increments ({data.next_month.label}):
                    </strong>
                  </div>
                  <div className="d-flex flex-wrap gap-2">
                    {data.next_month.employees.map((emp) => (
                      <Badge key={emp.id} bg="white" className="text-dark border shadow-xs px-2.5 py-1.5 fw-medium">
                        {emp.full_name} ({emp.due_date}) - <span className="text-success">+₹{Number(emp.raise_amount).toLocaleString("en-IN")}</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </Card.Body>
    </Card>
  );
};

export default UpcomingIncrementsChartWidget;
