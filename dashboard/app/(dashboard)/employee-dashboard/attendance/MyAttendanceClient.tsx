"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Col, Row, Table, Form } from "react-bootstrap";
import { IconLogin2, IconLogout2, IconRefresh, IconShieldLock, IconMapPin, IconInfoCircle } from "@tabler/icons-react";
import Swal from "sweetalert2";
import CustomPagination from "../../../../components/shared/CustomPagination";
import {
  getCurrentPosition,
  getGeolocationPermissionState,
  isGeolocationPermissionDenied,
  isGeolocationUnavailable,
  toAttendanceLocationPayload,
} from "../../../../helper/locationPermission";

type AttendanceRecord = {
  id: number;
  date: string;
  check_in: string | null;
  check_out: string | null;
  total_hours: string | null;
  status: string;
  status_label: string;
  live_status: string;
  is_paid: boolean;
};

type TodayAttendance = {
  date: string;
  check_in: string | null;
  check_out: string | null;
  total_hours: string | null;
  status: string;
  status_label: string;
  live_status: string;
};

type SecuritySettings = {
  ipRestrictionEnabled: boolean;
  geofencingEnabled: boolean;
  geofenceRadius: number;
  officeLatitude: string;
  officeLongitude: string;
};

const API_URL = `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/attendance/`;
const recordsPerPage = 8;

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
  if (!value) return "--:--";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "--:--";
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

const MyAttendanceClient = () => {
  const [mounted, setMounted] = useState(false);
  const [today, setToday] = useState<TodayAttendance | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<"check-in" | "check-out" | null>(null);
  const [error, setError] = useState<any>(null);
  const [attendanceBlockedMessage, setAttendanceBlockedMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings>({
    ipRestrictionEnabled: false,
    geofencingEnabled: false,
    geofenceRadius: 100,
    officeLatitude: "",
    officeLongitude: "",
  });

  const loadAttendance = async () => {
    setIsLoading(true);
    setError("");
    setAttendanceBlockedMessage("");

    try {
      const today = new Date();
      const year = today.getFullYear();
      const date_from = `${year}-01-01`;
      const date_to = `${year}-12-31`;
      const params = new URLSearchParams({ date_from, date_to, page_size: "365" });

      const [todayResponse, recordsResponse, settingsResponse] = await Promise.all([
        fetch(`${API_URL}me/today/`, { headers: authHeaders() }),
        fetch(`${API_URL}me/?${params.toString()}`, { headers: authHeaders() }),
        fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/settings/`, { headers: authHeaders() }),
      ]);

      if (!todayResponse.ok) {
        const todayError = await todayResponse.json().catch(() => null);
        const detail = todayError?.detail || "Unable to load today's attendance summary.";
        const isExpectedStatusRestriction =
          typeof detail === "string"
          && (detail.includes("Inactive") || detail.includes("Terminated") || detail.includes("On Leave"));
        if (isExpectedStatusRestriction) {
          setToday(null);
          setAttendanceBlockedMessage(detail);
        } else {
          throw new Error(detail);
        }
      } else {
        setToday((await todayResponse.json()) as TodayAttendance);
      }
      if (!recordsResponse.ok) throw new Error("Unable to load your attendance history.");

      const recordsData = await recordsResponse.json();
      const allRecords = Array.isArray(recordsData) ? recordsData : recordsData.results || [];
      setRecords(allRecords);

      if (settingsResponse.ok) {
        const s = await settingsResponse.json();
        setSecuritySettings({
          ipRestrictionEnabled: s.ip_restriction_enabled ?? false,
          geofencingEnabled: s.geofencing_enabled ?? false,
          geofenceRadius: s.geofence_radius ?? 100,
          officeLatitude: s.office_latitude ?? "",
          officeLongitude: s.office_longitude ?? "",
        });
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load your attendance.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    loadAttendance();
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const parseError = async (response: Response): Promise<any> => {
    try {
      const body = await response.json();
      return body;
    } catch {
      return { detail: "Attendance action failed. Please try again." };
    }
  };

  const showLocationEnablePopup = async (reason: "blocked" | "unavailable" | "prompt") => {
    const title = reason === "prompt" ? "Allow location access" : "Enable location access";
    const text =
      reason === "blocked"
        ? "Location is blocked for this site. Open the browser lock/site settings, allow Location, then come back and retry."
        : reason === "unavailable"
          ? "Your device location service looks disabled or unavailable. Turn on Location/GPS in system settings, then retry."
          : "Your browser will show a location permission popup. Please choose Allow to mark attendance.";

    const result = await Swal.fire({
      icon: "warning",
      title,
      html: `<div style="text-align:left">
        <p>${text}</p>
        <ol style="margin:0 0 0 18px;padding:0">
          <li>Click the lock icon near the address bar.</li>
          <li>Set Location to Allow.</li>
          <li>Refresh or retry attendance after changing it.</li>
        </ol>
      </div>`,
      showCancelButton: true,
      confirmButtonText: reason === "prompt" ? "Show location popup" : "I enabled it, retry",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#0d6efd",
    });

    return result.isConfirmed;
  };

  /**
   * Attempt to get current GPS coordinates.
   * Returns null if geofencing is disabled (no need to fetch location).
   * Throws a user-friendly error if permission is denied or unavailable.
   */
  const getLocationIfRequired = async (): Promise<{ latitude: number; longitude: number; accuracy?: number; timestamp?: number } | null> => {
    if (!securitySettings.geofencingEnabled) return null;

    const permissionState = await getGeolocationPermissionState();
    if (permissionState === "denied") {
      const shouldRetry = await showLocationEnablePopup("blocked");
      if (!shouldRetry) {
        throw new Error("Location permission is required to mark attendance.");
      }
    } else if (permissionState === "prompt") {
      const shouldPrompt = await showLocationEnablePopup("prompt");
      if (!shouldPrompt) {
        throw new Error("Location permission is required to mark attendance.");
      }
    }

    try {
      const position = await getCurrentPosition();
      return toAttendanceLocationPayload(position);
    } catch (geoError) {
      if (securitySettings.ipRestrictionEnabled) {
        return null;
      }
      if (isGeolocationPermissionDenied(geoError)) {
        await showLocationEnablePopup("blocked");
        throw new Error("Location permission denied. Geofencing is active. Please enable location access in your browser settings and try again.");
      }
      if (isGeolocationUnavailable(geoError)) {
        await showLocationEnablePopup("unavailable");
        throw new Error("Could not get your GPS location. Please enable device location services and try again.");
      }
      throw new Error("Could not get your GPS location. Please enable location services and try again.");
    }
  };

  const markAttendance = async (action: "check-in" | "check-out") => {
    setActionLoading(action);
    setError(null);
    setSuccess("");

    try {
      // Fetch location for both check-in and check-out when geofencing is active
      const locationData = await getLocationIfRequired();

      const response = await fetch(`${API_URL}${action}/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(locationData ?? {}),
      });

      if (!response.ok) {
        const errorBody = await parseError(response);
        throw errorBody;
      }

      setSuccess(action === "check-in" ? "✓ Checked in successfully!" : "✓ Checked out successfully!");
      await loadAttendance();
    } catch (actionError: any) {
      if (actionError && typeof actionError === "object" && actionError.detail) {
        setError(actionError);
      } else {
        setError({ detail: actionError instanceof Error ? actionError.message : "Unable to mark attendance." });
      }
    } finally {
      setActionLoading(null);
    }
  };

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    records.forEach((record) => {
      if (!record.date) return;
      const date = new Date(record.date);
      const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      months.add(monthStr);
    });
    return Array.from(months).sort().reverse();
  }, [records]);

  const monthFilteredRecords = useMemo(() => {
    if (selectedMonth === "all") return records;
    return records.filter((record) => {
      if (!record.date) return false;
      const date = new Date(record.date);
      const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      return monthStr === selectedMonth;
    });
  }, [records, selectedMonth]);

  const fullyFilteredRecords = useMemo(() => {
    if (selectedStatus === "all") return monthFilteredRecords;
    return monthFilteredRecords.filter(r => r.status === selectedStatus);
  }, [monthFilteredRecords, selectedStatus]);

  const currentRecords = useMemo(() => {
    const first = (currentPage - 1) * recordsPerPage;
    return fullyFilteredRecords.slice(first, first + recordsPerPage);
  }, [currentPage, fullyFilteredRecords]);

  const summary = useMemo(() => {
    const s = {
      present: 0,
      late: 0,
      absent: 0,
      halfDay: 0,
      leave: 0,
      paidLeave: 0,
      holiday: 0,
      sundayUnpaid: 0,
      unpaidDays: 0,
    };
    monthFilteredRecords.forEach((record) => {
      if (record.status === "PRESENT") s.present += 1;
      if (record.status === "LATE") s.late += 1;
      if (record.status === "ABSENT") s.absent += 1;
      if (record.status === "HALF_DAY") s.halfDay += 1;
      if (record.status === "LEAVE") s.leave += 1;
      if (record.status === "PAID_LEAVE") s.paidLeave += 1;
      if (record.status === "HOLIDAY") s.holiday += 1;
      if (record.status === "SUNDAY_UNPAID") s.sundayUnpaid += 1;
      if (["ABSENT", "LEAVE", "SUNDAY_UNPAID"].includes(record.status)) s.unpaidDays += 1;
      if (record.status === "HALF_DAY" && !record.is_paid) s.unpaidDays += 0.5;
    });
    return s;
  }, [monthFilteredRecords]);

  const totalPages = Math.ceil(fullyFilteredRecords.length / recordsPerPage);
  const canCheckIn = today && !today.check_in;
  const canCheckOut = today && today.check_in && !today.check_out;

  return (
    <div>
      {error && (
        <div className="alert alert-danger d-flex align-items-start gap-2 mb-4 shadow-sm border-0" style={{ background: "#fdf2f2", borderLeft: "4px solid #f05252", color: "#9b1c1c" }}>
          <IconShieldLock size={22} className="flex-shrink-0 mt-1" />
          <div className="w-100">
            {typeof error === "string" ? (
              <div className="fw-semibold">{error}</div>
            ) : (
              <div>
                <div className="fw-bold mb-2 fs-6">{error.detail}</div>
                {error.code === "OUTSIDE_GEOFENCE" && (
                  <div className="mt-2 p-3 bg-white bg-opacity-75 rounded-3 border border-danger-subtle text-dark small shadow-sm">
                    <div className="fw-bold text-danger mb-2 d-flex align-items-center gap-1">
                      <IconInfoCircle size={16} /> Location Diagnostics
                    </div>
                    <ul className="mb-3 ps-3 text-secondary" style={{ listStyleType: "square" }}>
                      <li><strong>Your coordinates:</strong> {error.user_location?.latitude?.toFixed(6)}, {error.user_location?.longitude?.toFixed(6)}</li>
                      <li><strong>Accuracy:</strong> ±{error.user_location?.accuracy_meters !== null ? `${error.user_location?.accuracy_meters} meters` : "Unknown"}</li>
                      <li><strong>Office coordinates:</strong> {error.office_location?.latitude?.toFixed(6)}, {error.office_location?.longitude?.toFixed(6)}</li>
                      <li><strong>Calculated distance:</strong> <span className="text-danger fw-bold">{error.distance_meters} meters</span> (Allowed limit: {error.allowed_radius_meters} meters)</li>
                    </ul>
                    <div className="fw-bold text-dark mb-1">Troubleshooting Tips:</div>
                    <ol className="mb-0 ps-3 text-secondary">
                      <li><strong>Desktop/Laptop Geolocation issue:</strong> Desktop browsers lack hardware GPS chips and rely on Wi-Fi/IP location databases, which are often inaccurate by kilometers. Try marking attendance from a <strong>mobile phone</strong>.</li>
                      <li><strong>Turn on Wi-Fi:</strong> Enabling Wi-Fi (even if not connected) helps browsers triangulate location much more precisely.</li>
                      <li><strong>Disable VPNs:</strong> A VPN routes your connection through another server, spoofing your location. Turn off any active VPNs.</li>
                      <li><strong>Office Network bypass:</strong> If you are physically at the office, connect to the <strong>office Wi-Fi network</strong>. The system will automatically bypass the geofence restriction if you are on the office IP.</li>
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {attendanceBlockedMessage && (
        <div className="alert alert-secondary d-flex align-items-start gap-2 mb-4 shadow-sm border-0">
          <IconShieldLock size={22} className="flex-shrink-0 mt-1" />
          <div>
            <div className="fw-bold">Attendance actions disabled</div>
            <div className="small mt-1">
              {attendanceBlockedMessage} Your historical attendance remains available below. Contact HR if your employment status needs correction.
            </div>
          </div>
        </div>
      )}
      {success && (
        <div className="alert alert-success d-flex align-items-center gap-2 mb-3">
          <span>{success}</span>
        </div>
      )}

      {/* Active restriction banners */}
      {(securitySettings.ipRestrictionEnabled || securitySettings.geofencingEnabled) && (
        <div className="d-flex flex-column gap-2 mb-4">
          {securitySettings.ipRestrictionEnabled && (
            <div className="d-inline-flex align-items-center gap-2 px-3 py-2 rounded-3 small fw-semibold align-self-start"
              style={{ background: "#fff3cd", border: "1px solid #ffc107", color: "#856404" }}>
              <IconShieldLock size={16} />
              IP Restriction Active — Office network required
            </div>
          )}
          {securitySettings.geofencingEnabled && (
            <div className="w-100 p-3 rounded-3 border"
              style={{ background: "#cfe2ff", borderColor: "#b6d4fe", color: "#084298" }}>
              <div className="d-flex align-items-center gap-2 fw-semibold mb-1 small">
                <IconMapPin size={18} />
                Geofencing Active — Must be within {securitySettings.geofenceRadius}m of office
              </div>
              <div className="small text-secondary-emphasis ps-4">
                Note: Desktop browsers can report location errors. Connecting your device to the <strong>office Wi-Fi network</strong> or using your <strong>mobile phone</strong> is highly recommended for hassle-free check-in.
              </div>
            </div>
          )}
        </div>
      )}

      <Card className="border-0 shadow-sm mb-4">
        <Card.Body className="p-4">
          <div className="d-flex flex-column flex-lg-row justify-content-between gap-4">
            <div>
              <h4 className="mb-1 fw-bold text-dark">Mark Attendance</h4>
              <p className="text-secondary mb-0">
                {mounted 
                  ? currentTime.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) 
                  : "Loading current date..."}
              </p>
              <span className="badge bg-primary-subtle text-primary border border-primary-subtle mt-2 px-3 py-1.5 rounded-pill fw-semibold">
                Shift Timing: 10:00 AM - 06:00 PM
              </span>
            </div>
            <div className="text-lg-end">
              <div className="display-6 fw-bold text-dark">
                {mounted ? currentTime.toLocaleTimeString("en-IN") : "--:--:--"}
              </div>
              <div className="text-secondary small">Asia/Kolkata</div>
            </div>
          </div>

          <Row className="g-4 mt-2">
            <Col md={4}>
              <div className="attendance-punch-box">
                <div className="text-secondary small">Check In</div>
                <div className="fs-4 fw-bold">{formatTime(today?.check_in)}</div>
              </div>
            </Col>
            <Col md={4}>
              <div className="attendance-punch-box">
                <div className="text-secondary small">Check Out</div>
                <div className="fs-4 fw-bold">{formatTime(today?.check_out)}</div>
              </div>
            </Col>
            <Col md={4}>
              <div className="attendance-punch-box">
                <div className="text-secondary small">Today Status</div>
                <div className="fs-5 fw-bold">{today?.live_status || "Not marked"}</div>
              </div>
            </Col>
          </Row>

          <div className="d-flex flex-wrap gap-2 mt-4">
            <Button
              variant="success"
              className="d-inline-flex align-items-center gap-2"
              onClick={() => markAttendance("check-in")}
              disabled={isLoading || !canCheckIn || actionLoading !== null}
            >
              <IconLogin2 size={18} /> {actionLoading === "check-in" ? "Checking in..." : "Check In"}
            </Button>
            <Button
              variant="danger"
              className="d-inline-flex align-items-center gap-2"
              onClick={() => markAttendance("check-out")}
              disabled={isLoading || !canCheckOut || actionLoading !== null}
            >
              <IconLogout2 size={18} /> {actionLoading === "check-out" ? "Checking out..." : "Check Out"}
            </Button>
            <Button variant="outline-secondary" className="d-inline-flex align-items-center gap-2" onClick={loadAttendance}>
              <IconRefresh size={18} /> Refresh
            </Button>
          </div>
        </Card.Body>
      </Card>

      <Card className="border-0 shadow-sm mb-4">
        <Card.Header className="bg-white d-flex flex-column flex-md-row align-items-md-center justify-content-between py-3">
          <h4 className="mb-2 mb-md-0 fw-bold text-dark">My Attendance Summary</h4>
          <div className="d-flex align-items-center gap-2">
            <span className="text-secondary small fw-semibold text-nowrap">Filter by Month:</span>
            <Form.Select 
              size="sm" 
              value={selectedMonth} 
              onChange={(e) => {
                setSelectedMonth(e.target.value);
                setCurrentPage(1);
              }}
              style={{ minWidth: "150px" }}
            >
              <option value="all">All Months</option>
              {availableMonths.map(month => {
                const [year, m] = month.split('-');
                const date = new Date(parseInt(year), parseInt(m) - 1);
                const label = date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
                return <option key={month} value={month}>{label}</option>;
              })}
            </Form.Select>
          </div>
        </Card.Header>
        <Card.Body>
          <Table hover responsive className="text-nowrap align-middle mb-0" style={{ minWidth: "750px" }}>
            <thead className="table-light">
              <tr>
                <th className="text-center">Present</th>
                <th className="text-center">Late Entry</th>
                <th className="text-center">Absent</th>
                <th className="text-center">Half Day</th>
                <th className="text-center">Leave</th>
                <th className="text-center">Paid Leave</th>
                <th className="text-center">Holiday</th>
                <th className="text-center">Sunday Unpaid</th>
                <th className="text-center">Unpaid Days</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="text-center fw-bold text-success">{summary.present}</td>
                <td className="text-center fw-bold text-warning">{summary.late}</td>
                <td className="text-center fw-bold text-danger">{summary.absent}</td>
                <td className="text-center fw-bold text-info">{summary.halfDay}</td>
                <td className="text-center fw-bold text-danger">{summary.leave}</td>
                <td className="text-center fw-bold text-primary">{summary.paidLeave}</td>
                <td className="text-center fw-bold text-success">{summary.holiday}</td>
                <td className="text-center fw-bold text-secondary">{summary.sundayUnpaid}</td>
                <td className="text-center fw-bold text-danger">{summary.unpaidDays}</td>
              </tr>
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      <Card className="border-0 shadow-sm">
        <Card.Header className="bg-white d-flex flex-column flex-md-row align-items-md-center justify-content-between py-3">
          <h4 className="mb-2 mb-md-0 fw-bold text-dark">My Attendance Records</h4>
          <div className="d-flex align-items-center gap-2">
            <span className="text-secondary small fw-semibold text-nowrap">Filter by Status:</span>
            <Form.Select 
              size="sm" 
              value={selectedStatus} 
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              style={{ minWidth: "140px" }}
            >
              <option value="all">All Statuses</option>
              {attendanceStatuses.map((attendanceStatus) => (
                <option key={attendanceStatus.value} value={attendanceStatus.value}>{attendanceStatus.label}</option>
              ))}
            </Form.Select>
          </div>
        </Card.Header>
        <Card.Body>
          <Table hover responsive className="text-nowrap align-middle" style={{ minWidth: "550px" }}>
            <thead className="table-light">
              <tr>
                <th>Date</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={4} className="text-center py-4 text-secondary">Loading records...</td></tr>}
              {!isLoading && currentRecords.length === 0 && <tr><td colSpan={4} className="text-center py-4 text-secondary">No attendance records yet.</td></tr>}
              {!isLoading && currentRecords.map((record) => (
                <tr key={record.id}>
                  <td>{formatDate(record.date)}</td>
                  <td>{formatTime(record.check_in)}</td>
                  <td>{formatTime(record.check_out)}</td>
                  <td><Badge bg={getStatusBadge(record.status)}>{record.status_label}</Badge></td>
                </tr>
              ))}
            </tbody>
          </Table>
          <CustomPagination currentPage={currentPage} totalPages={totalPages || 1} onPageChange={setCurrentPage} />
        </Card.Body>
      </Card>

      <style jsx global>{`
        .attendance-punch-box {
          background: #fbfcfe;
          border: 1px solid #edf1f5;
          border-radius: 10px;
          padding: 16px;
          height: 100%;
        }
      `}</style>
    </div>
  );
};

export default MyAttendanceClient;
