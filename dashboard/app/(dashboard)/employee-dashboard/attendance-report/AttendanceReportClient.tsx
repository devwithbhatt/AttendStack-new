"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Col, Form, Row, Table } from "react-bootstrap";
import { IconRefresh } from "@tabler/icons-react";
import CustomPagination from "../../../../components/shared/CustomPagination";

type AttendanceRecord = {
  id: number;
  date: string;
  check_in: string | null;
  check_out: string | null;
  total_hours: string | null;
  status: string;
  status_label: string;
};

const API_URL = `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/attendance/me/`;
const recordsPerPage = 10;

const authHeaders = (): HeadersInit => {
  const token = localStorage.getItem("authToken");
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

const getStatusBadge = (status: string) => {
  switch (status) {
    case "PRESENT": return "success";
    case "LATE": return "warning";
    case "HALF_DAY": return "info";
    case "ABSENT": return "danger";
    case "LEAVE": return "danger";
    case "PAID_LEAVE": return "primary";
    case "HOLIDAY": return "success";
    case "SUNDAY_PAID": return "dark";
    case "SUNDAY_UNPAID": return "secondary";
    default:
      return "light";
  }
};

const AttendanceReportClient = () => {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const todayDate = today.toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(todayDate);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReport = async () => {
    setIsLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      const response = await fetch(`${API_URL}?${params.toString()}`, { headers: authHeaders() });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || "Unable to load attendance report.");
      }
      setRecords((await response.json()) as AttendanceRecord[]);
      setCurrentPage(1);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load attendance report.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, []);

  const currentRecords = useMemo(() => {
    const first = (currentPage - 1) * recordsPerPage;
    return records.slice(first, first + recordsPerPage);
  }, [currentPage, records]);

  const totalPages = Math.ceil(records.length / recordsPerPage);

  return (
    <Card className="border-0 shadow-sm">
      <Card.Header className="bg-white">
        <h4 className="mb-0">Attendance Report</h4>
      </Card.Header>
      <Card.Body>
        {error && <div className="alert alert-danger">{error}</div>}
        <Form className="mb-4" onSubmit={(event) => { event.preventDefault(); loadReport(); }}>
          <Row className="g-3 align-items-end">
            <Col md={4}>
              <Form.Group>
                <Form.Label>From Date</Form.Label>
                <Form.Control type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label>To Date</Form.Label>
                <Form.Control type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Button variant="primary" type="submit" className="d-inline-flex align-items-center gap-2">
                <IconRefresh size={18} /> Generate Report
              </Button>
            </Col>
          </Row>
        </Form>
        <Table hover responsive className="text-nowrap align-middle" style={{ minWidth: "650px" }}>
          <thead className="table-light">
            <tr>
              <th>Date</th>
              <th>Check In</th>
              <th>Check Out</th>
              <th>Total Hours</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="text-center py-4 text-secondary">Loading report...</td></tr>}
            {!isLoading && currentRecords.length === 0 && <tr><td colSpan={5} className="text-center py-4 text-secondary">No records found.</td></tr>}
            {!isLoading && currentRecords.map((record) => (
              <tr key={record.id}>
                <td>{formatDate(record.date)}</td>
                <td>{formatTime(record.check_in)}</td>
                <td>{formatTime(record.check_out)}</td>
                <td>{record.total_hours || "-"}</td>
                <td><Badge bg={getStatusBadge(record.status)}>{record.status_label}</Badge></td>
              </tr>
            ))}
          </tbody>
        </Table>
        <CustomPagination currentPage={currentPage} totalPages={totalPages || 1} onPageChange={setCurrentPage} />
      </Card.Body>
    </Card>
  );
};

export default AttendanceReportClient;
