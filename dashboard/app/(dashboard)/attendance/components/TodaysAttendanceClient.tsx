"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, CardBody, Col, Form, Row, Table, Modal } from "react-bootstrap";
import { IconRefresh, IconUserCheck, IconUserExclamation, IconUserOff, IconUsers } from "@tabler/icons-react";
import DashboardStats from "components/dashboard/DashboardStats";

type TodayAttendance = {
  employee_uuid: string;
  employee_id: string;
  employee_name: string;
  employee_email: string;
  employee_department: string;
  employee_designation: string;
  employee_avatar_url: string | null;
  date: string;
  check_in: string | null;
  check_out: string | null;
  total_hours: string | null;
  status: string;
  status_label: string;
  live_status: string;
  record_id: number | null;
};

const API_URL = `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/attendance/today/`;
const BASE_API_URL = `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/attendance/`;

const authHeaders = (): HeadersInit => {
  const token = localStorage.getItem("authToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const formatTime = (value?: string | null) =>
  value ? new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "--";

const badgeClass = (status: string) => {
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

const attendanceStatuses = [
  { value: "PRESENT", label: "Present" },
  { value: "LATE", label: "Late Entry" },
  { value: "HALF_DAY", label: "Half Day" },
  { value: "ABSENT", label: "Absent" },
  { value: "LEAVE", label: "Leave" },
  { value: "PAID_LEAVE", label: "Paid Leave" },
  { value: "HOLIDAY", label: "Holiday" },
  { value: "SUNDAY_PAID", label: "Sunday" },
  { value: "SUNDAY_UNPAID", label: "Sunday Unpaid" },
];

const TodaysAttendanceClient = () => {
  const [records, setRecords] = useState<TodayAttendance[]>([]);
  const [nameQuery, setNameQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingRecord, setEditingRecord] = useState<TodayAttendance | null>(null);

  const loadToday = async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(API_URL, { headers: authHeaders() });
      if (!response.ok) throw new Error("Unable to load today's attendance.");
      setRecords((await response.json()) as TodayAttendance[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load today's attendance.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadToday();
  }, []);

  const handleSaveChanges = async (updated: { check_in: string | null; check_out: string | null; status: string }) => {
    if (!editingRecord) return;
    setError("");
    try {
      const isNew = !editingRecord.record_id;
      const url = isNew ? BASE_API_URL : `${BASE_API_URL}${editingRecord.record_id}/`;
      const method = isNew ? "POST" : "PATCH";
      const body = isNew ? {
        employee: editingRecord.employee_uuid,
        date: editingRecord.date,
        check_in: updated.check_in,
        check_out: updated.check_out,
        status: updated.status,
      } : {
        check_in: updated.check_in,
        check_out: updated.check_out,
        status: updated.status,
      };

      const response = await fetch(url, {
        method,
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errData = await response.json();
        const errMsg = errData.detail || Object.values(errData).flat().join(" ") || "Failed to save changes.";
        throw new Error(errMsg);
      }

      setEditingRecord(null);
      loadToday();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred.");
    }
  };

  const summaryStats = useMemo(() => {
    const total = records.length;
    const present = records.filter((record) => ["PRESENT", "LATE"].includes(record.status)).length;
    const absent = records.filter((record) => record.status === "ABSENT").length;
    const late = records.filter((record) => record.status === "LATE").length;

    return [
      { id: "total", title: "Total Employees", value: String(total), icon: <IconUsers size={24} strokeWidth={1.5} />, bgColor: "bg-gradient-primary", textColor: "text-primary-emphasis", bottomValue: "", description: "Active workforce" },
      { id: "present", title: "Present Today", value: String(present), icon: <IconUserCheck size={24} strokeWidth={1.5} />, bgColor: "bg-gradient-success", textColor: "text-success-emphasis", bottomValue: total ? `${Math.round((present / total) * 100)}%` : "0%", description: "Checked in/out" },
      { id: "absent", title: "Absent Today", value: String(absent), icon: <IconUserOff size={24} strokeWidth={1.5} />, bgColor: "bg-gradient-danger", textColor: "text-danger-emphasis", bottomValue: "", description: "No check-in yet" },
      { id: "late", title: "Late Entries", value: String(late), icon: <IconUserExclamation size={24} strokeWidth={1.5} />, bgColor: "bg-gradient-warning", textColor: "text-warning-emphasis", bottomValue: "", description: "After cutoff" },
    ];
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const query = nameQuery.toLowerCase();
      const matchesSearch =
        !query ||
        record.employee_name.toLowerCase().includes(query) ||
        record.employee_email.toLowerCase().includes(query) ||
        record.employee_id.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "All" || record.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [nameQuery, records, statusFilter]);

  return (
    <Fragment>
      <Row className="g-6 mb-6">
        <DashboardStats stats={summaryStats} />
      </Row>

      <Card className="border-0 shadow-sm mb-4">
        <CardBody>
          <Row className="align-items-end g-3">
            <Col md={5}>
              <Form.Group controlId="employeeNameSearch">
                <Form.Label>Search Employee</Form.Label>
                <Form.Control value={nameQuery} onChange={(event) => setNameQuery(event.target.value)} placeholder="Name, email, or employee ID" />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group controlId="statusFilter">
                <Form.Label>Status</Form.Label>
                <Form.Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="All">All</option>
                  {attendanceStatuses.map((attendanceStatus) => (
                    <option key={attendanceStatus.value} value={attendanceStatus.value}>{attendanceStatus.label}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={3} className="d-grid">
              <Button variant="outline-secondary" className="d-inline-flex align-items-center justify-content-center gap-2" onClick={loadToday}>
                <IconRefresh size={18} /> Refresh
              </Button>
            </Col>
          </Row>
        </CardBody>
      </Card>

      <Card className="border-0 shadow-sm">
        <Card.Header className="bg-white">
          <h4 className="mb-0">Today's Live Status</h4>
        </Card.Header>
        <CardBody>
          {error && <div className="alert alert-danger">{error}</div>}
          <Table hover responsive className="text-nowrap align-middle" style={{ minWidth: "720px" }}>
            <thead className="table-light">
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Status</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="text-center py-4 text-secondary">Loading attendance...</td></tr>}
              {!isLoading && filteredRecords.length === 0 && <tr><td colSpan={6} className="text-center py-4 text-secondary">No employees found.</td></tr>}
              {!isLoading && filteredRecords.map((record) => (
                <tr key={record.employee_uuid}>
                  <td>
                    <div className="d-flex align-items-center">
                      <img src={record.employee_avatar_url || "/images/avatar/avatar-fallback.jpg"} alt={record.employee_name} className="avatar avatar-sm rounded-circle me-3" />
                      <div>
                        <div className="fw-semibold">{record.employee_name}</div>
                        <small className="text-muted">{record.employee_id} - {record.employee_email}</small>
                      </div>
                    </div>
                  </td>
                  <td>{record.employee_department}</td>
                  <td>
                    <Badge bg={badgeClass(record.status)}>{record.status_label}</Badge>
                    {record.live_status !== record.status_label && (
                      <div className="small text-muted mt-1">{record.live_status}</div>
                    )}
                  </td>
                  <td>{formatTime(record.check_in)}</td>
                  <td>{formatTime(record.check_out)}</td>
                  <td className="text-end">
                    <Button variant="outline-primary" size="sm" onClick={() => setEditingRecord(record)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>

      {editingRecord && (
        <Modal show={!!editingRecord} onHide={() => setEditingRecord(null)}>
          <Modal.Header closeButton>
            <Modal.Title>Edit Attendance - {editingRecord.employee_name}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form id="edit-today-attendance-form">
              <Form.Group className="mb-3" controlId="formCheckIn">
                <Form.Label>Check In</Form.Label>
                <Form.Control 
                  name="checkin" 
                  type="time" 
                  defaultValue={editingRecord.check_in ? new Date(editingRecord.check_in).toTimeString().slice(0, 5) : "10:00"} 
                />
              </Form.Group>
              <Form.Group className="mb-3" controlId="formCheckOut">
                <Form.Label>Check Out</Form.Label>
                <Form.Control 
                  name="checkout" 
                  type="time" 
                  defaultValue={editingRecord.check_out ? new Date(editingRecord.check_out).toTimeString().slice(0, 5) : "18:00"} 
                />
              </Form.Group>
              <Form.Group className="mb-3" controlId="formStatus">
                <Form.Label>Status</Form.Label>
                <Form.Select name="status" defaultValue={editingRecord.status || "PRESENT"}>
                  {attendanceStatuses.map((attendanceStatus) => (
                    <option key={attendanceStatus.value} value={attendanceStatus.value}>{attendanceStatus.label}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Form>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setEditingRecord(null)}>
              Close
            </Button>
            <Button variant="primary" onClick={() => {
              const form = document.querySelector("#edit-today-attendance-form") as HTMLFormElement;
              const checkInInput = form.elements.namedItem("checkin") as HTMLInputElement;
              const checkOutInput = form.elements.namedItem("checkout") as HTMLInputElement;
              const statusSelect = form.elements.namedItem("status") as HTMLSelectElement;

              handleSaveChanges({
                check_in: checkInInput?.value || null,
                check_out: checkOutInput?.value || null,
                status: statusSelect?.value || "PRESENT",
              });
            }}>
              Save Changes
            </Button>
          </Modal.Footer>
        </Modal>
      )}
    </Fragment>
  );
};

export default TodaysAttendanceClient;
