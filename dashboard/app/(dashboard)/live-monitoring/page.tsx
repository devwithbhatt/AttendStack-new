"use client";

/**
 * Live Monitoring — Company Admin
 *
 * Read-only live view of the organisation's registered work computers.
 * The admin can watch a screen; there is no control path of any kind.
 *
 * Video is WebRTC peer-to-peer; this page only exchanges the SDP/ICE handshake
 * over a WebSocket (ws/monitor/view/<id>/). Roster + audit come from the REST
 * API. Access follows the "Live Monitoring" role permission (Settings -> Assign
 * Role; full admins always have it) in the sidebar and page guard, and is
 * enforced again server-side on every endpoint and on the viewer socket.
 */

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Button, Modal, Table, Spinner, Badge, Alert, Form } from "react-bootstrap";
import {
  IconRefresh,
  IconDownload,
  IconEye,
  IconHistory,
  IconTrash,
  IconCamera,
  IconSettings,
  IconActivity,
  IconMessage,
} from "@tabler/icons-react";
import Swal from "sweetalert2";
import DasherBreadcrumb from "components/common/DasherBreadcrumb";

const API = `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/monitoring`;

const token = () =>
  typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
const authHeaders = (): HeadersInit => {
  const t = token();
  return { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) };
};
const wsHost = () => {
  const raw = (process.env.NEXT_PUBLIC_API_ENDPOINT || "").trim();
  try {
    return raw.startsWith("http") ? new URL(raw).host : raw;
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
};

interface Device {
  id: string;
  employee_name: string;
  device_name: string;
  platform: string;
  is_active: boolean;
  is_online: boolean;
  last_seen_at: string | null;
  last_active_at: string | null;
  created_at: string;
}
interface Session {
  id: string;
  viewer_email: string;
  watched_user_email: string;
  device_label: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  viewer_ip: string | null;
}
interface SnapSettings {
  interval_minutes: number;
  retention_days: number;
  is_enabled: boolean;
  device_overrides: Record<string, number>;
}
interface SnapshotItem {
  id: string;
  device: string;
  device_name: string;
  employee_name: string;
  image: string;
  captured_at: string;
}

interface ActivityEntryItem {
  id: string;
  device: string;
  device_name: string;
  employee_name: string;
  title: string;
  app_name: string;
  url: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
}
interface InactivitySettingsData {
  idle_threshold_minutes: number;
  long_interval_threshold_minutes: number;
}

const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");
const fmtDur = (s: number | null) =>
  s == null ? "live / —" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;

const INTERVAL_OPTIONS = [5, 10, 15, 30, 60];
const RETENTION_OPTIONS = [
  { label: "15 days", days: 15 },
  { label: "45 days", days: 45 },
  { label: "3 months", days: 90 },
  { label: "8 months", days: 240 },
];

export default function LiveMonitoringPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [watching, setWatching] = useState<Device | null>(null);
  const [watchStatus, setWatchStatus] = useState("");

  const [showLog, setShowLog] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);

  // Snapshots
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [snapshotDevice, setSnapshotDevice] = useState<string>("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [snapSettings, setSnapSettings] = useState<SnapSettings>({ interval_minutes: 30, retention_days: 90, is_enabled: true, device_overrides: {} });
  const [settingsInterval, setSettingsInterval] = useState(30);
  const [customInterval, setCustomInterval] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [retentionDays, setRetentionDays] = useState(90);
  const [isCustomRetention, setIsCustomRetention] = useState(false);
  const [customRetention, setCustomRetention] = useState("");
  const [applyToAll, setApplyToAll] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Uninstall protection
  const [uninstallPwSet, setUninstallPwSet] = useState(false);
  const [uninstallPw, setUninstallPw] = useState("");
  const [uninstallPwConfirm, setUninstallPwConfirm] = useState("");
  const [uninstallSaving, setUninstallSaving] = useState(false);

  // Activity log
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [activityDevice, setActivityDevice] = useState<Device | null>(null);
  const [activityEntries, setActivityEntries] = useState<ActivityEntryItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityDate, setActivityDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [inactivitySettings, setInactivitySettings] = useState<InactivitySettingsData>({ idle_threshold_minutes: 3, long_interval_threshold_minutes: 10 });
  const [inactSaving, setInactSaving] = useState(false);

  // Messaging
  const [showSendMessage, setShowSendMessage] = useState(false);
  const [messageDevice, setMessageDevice] = useState<Device | null>(null);
  const [messageContent, setMessageContent] = useState("");
  const [messageSending, setMessageSending] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // ---------------------------------------------------------------- roster
  const loadDevices = useCallback(async () => {
    try {
      const r = await fetch(`${API}/devices/`, { headers: authHeaders() });
      if (!r.ok) throw new Error(`Failed to load devices (${r.status})`);
      const data = await r.json();
      setDevices(data.results || data);
      setError("");
    } catch (e: any) {
      setError(e.message || "Could not load devices.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
    const id = setInterval(loadDevices, 8000);
    return () => clearInterval(id);
  }, [loadDevices]);

  // ---------------------------------------------------------------- watch
  const stopWatching = useCallback(() => {
    try { wsRef.current?.close(); } catch {}
    try { pcRef.current?.close(); } catch {}
    wsRef.current = null;
    pcRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setWatching(null);
    setWatchStatus("");
    loadDevices();
  }, [loadDevices]);

  const startWatching = (device: Device) => {
    setWatching(device);
    setWatchStatus("Connecting…");
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${wsHost()}/ws/monitor/view/${device.id}/?token=${encodeURIComponent(token() || "")}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    let iceServers: RTCIceServer[] = [];

    ws.onmessage = async (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "ready") {
        iceServers = msg.ice_servers || [];
        setWatchStatus("Waiting for screen…");
      } else if (msg.type === "offer") {
        const pc = new RTCPeerConnection({ iceServers });
        pcRef.current = pc;
        pc.ontrack = (e) => {
          if (videoRef.current) videoRef.current.srcObject = e.streams[0];
          setWatchStatus("● Live");
        };
        pc.onicecandidate = (e) => {
          if (e.candidate && ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ action: "ice", session: msg.session, payload: e.candidate.toJSON() }));
        };
        await pc.setRemoteDescription(msg.payload);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ action: "answer", session: msg.session, payload: { type: answer.type, sdp: answer.sdp } }));
      } else if (msg.type === "ice" && pcRef.current && msg.payload) {
        try { await pcRef.current.addIceCandidate(msg.payload); } catch {}
      }
    };
    ws.onclose = () => setWatchStatus((s) => (s === "● Live" ? "Stream ended / employee went offline." : s || "Disconnected."));
    ws.onerror = () => setWatchStatus("Connection error (device offline or not authorised).");
  };

  // --------------------------------------------------------- permanent delete
  const deleteDevice = async (device: Device) => {
    const ok = await Swal.fire({
      title: "Permanently delete this device?",
      html: `<b>${device.employee_name} — ${device.device_name}</b><br/><br/>This will permanently remove the device and all its snapshots. This action cannot be undone.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete permanently",
      confirmButtonColor: "#dc3545",
    });
    if (!ok.isConfirmed) return;
    const r = await fetch(`${API}/devices/${device.id}/delete/`, { method: "DELETE", headers: authHeaders() });
    if (r.ok) { Swal.fire("Deleted", "Device and its data have been permanently removed.", "success"); loadDevices(); }
    else Swal.fire("Failed", `Could not delete (${r.status}).`, "error");
  };

  // ------------------------------------------------------------- unrevoke
  const unrevoke = async (device: Device) => {
    const ok = await Swal.fire({
      title: "Reactivate this device?",
      text: `${device.employee_name} — ${device.device_name}. The device will be marked active again.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Reactivate",
      confirmButtonColor: "#198754",
    });
    if (!ok.isConfirmed) return;
    const r = await fetch(`${API}/devices/${device.id}/unrevoke/`, { method: "POST", headers: authHeaders() });
    if (r.ok) { Swal.fire("Reactivated", "", "success"); loadDevices(); }
    else Swal.fire("Failed", `Could not reactivate (${r.status}).`, "error");
  };

  // ------------------------------------------------------------- revoke
  const revoke = async (device: Device) => {
    const ok = await Swal.fire({
      title: "Deregister this device?",
      text: `${device.employee_name} — ${device.device_name}. The employee's login is unaffected; they'd need to sign in again on that computer.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Deregister",
      confirmButtonColor: "#ef4444",
    });
    if (!ok.isConfirmed) return;
    const r = await fetch(`${API}/devices/${device.id}/revoke/`, { method: "POST", headers: authHeaders() });
    if (r.ok) { Swal.fire("Deregistered", "", "success"); loadDevices(); }
    else Swal.fire("Failed", `Could not deregister (${r.status}).`, "error");
  };

  // ------------------------------------------------------------- download
  const downloadApp = async () => {
    try {
      const r = await fetch(`${API}/agent/download/`, { headers: authHeaders() });
      if (r.status === 404) {
        Swal.fire("Not available yet", "The monitoring app installer hasn't been published yet.", "info");
        return;
      }
      if (!r.ok) throw new Error(`(${r.status})`);
      const blob = await r.blob();
      const cd = r.headers.get("content-disposition") || "";
      const match = cd.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
      const serverName = match ? decodeURIComponent(match[1].replace(/"$/, "")) : "";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = serverName || "ZuperHR Monitor.exe";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      Swal.fire("Download failed", e.message || "Please try again.", "error");
    }
  };

  // ------------------------------------------------------------- audit log
  const openLog = async () => {
    setShowLog(true);
    try {
      const r = await fetch(`${API}/sessions/`, { headers: authHeaders() });
      const data = await r.json();
      setSessions(data.results || data);
    } catch { setSessions([]); }
  };

  // ------------------------------------------------------------- snapshots
  const openSnapshots = async (deviceId?: string) => {
    setShowSnapshots(true);
    setSnapshotsLoading(true);
    setSnapshotDevice(deviceId || "");
    try {
      const url = deviceId ? `${API}/snapshots/?device=${deviceId}` : `${API}/snapshots/`;
      const r = await fetch(url, { headers: authHeaders() });
      const data = await r.json();
      setSnapshots(data.results || data);
    } catch { setSnapshots([]); }
    finally { setSnapshotsLoading(false); }
  };

  const loadSnapshotsForDevice = async (deviceId: string) => {
    setSnapshotsLoading(true);
    setSnapshotDevice(deviceId);
    try {
      const url = deviceId ? `${API}/snapshots/?device=${deviceId}` : `${API}/snapshots/`;
      const r = await fetch(url, { headers: authHeaders() });
      const data = await r.json();
      setSnapshots(data.results || data);
    } catch { setSnapshots([]); }
    finally { setSnapshotsLoading(false); }
  };

  // ------------------------------------------------------------- settings
  const openSettings = async () => {
    setShowSettings(true);
    setUninstallPw("");
    setUninstallPwConfirm("");
    try {
      const [r, upRes] = await Promise.all([
        fetch(`${API}/snapshot-settings/`, { headers: authHeaders() }),
        fetch(`${API}/uninstall-password/`, { headers: authHeaders() }),
      ]);
      if (r.ok) {
        const data = await r.json();
        setSnapSettings(data);
        const interval = data.interval_minutes;
        if (INTERVAL_OPTIONS.includes(interval)) {
          setSettingsInterval(interval);
          setIsCustom(false);
          setCustomInterval("");
        } else {
          setIsCustom(true);
          setCustomInterval(String(interval));
          setSettingsInterval(0);
        }
        const ret = data.retention_days || 90;
        const matchedRetention = RETENTION_OPTIONS.find((o) => o.days === ret);
        if (matchedRetention) {
          setRetentionDays(ret);
          setIsCustomRetention(false);
          setCustomRetention("");
        } else {
          setIsCustomRetention(true);
          setCustomRetention(String(ret));
          setRetentionDays(0);
        }
      }
      if (upRes.ok) {
        const upData = await upRes.json();
        setUninstallPwSet(upData.is_set);
      }
    } catch {}
  };

  const saveUninstallPassword = async () => {
    if (!uninstallPw || uninstallPw.length < 4) {
      Swal.fire("Invalid", "Password must be at least 4 characters.", "warning");
      return;
    }
    if (uninstallPw !== uninstallPwConfirm) {
      Swal.fire("Mismatch", "Passwords do not match.", "warning");
      return;
    }
    setUninstallSaving(true);
    try {
      const r = await fetch(`${API}/uninstall-password/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ password: uninstallPw }),
      });
      if (r.ok) {
        setUninstallPwSet(true);
        setUninstallPw("");
        setUninstallPwConfirm("");
        Swal.fire({ icon: "success", title: "Uninstall password set", timer: 1500, showConfirmButton: false });
      } else Swal.fire("Error", "Could not set password.", "error");
    } catch { Swal.fire("Error", "Could not set password.", "error"); }
    finally { setUninstallSaving(false); }
  };

  const removeUninstallPassword = async () => {
    const ok = await Swal.fire({
      title: "Remove uninstall protection?",
      text: "Employees will be able to quit or uninstall the monitoring app without a password.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Remove",
      confirmButtonColor: "#dc3545",
    });
    if (!ok.isConfirmed) return;
    try {
      const r = await fetch(`${API}/uninstall-password/`, { method: "DELETE", headers: authHeaders() });
      if (r.ok) {
        setUninstallPwSet(false);
        Swal.fire({ icon: "success", title: "Uninstall protection removed", timer: 1500, showConfirmButton: false });
      }
    } catch {}
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    const interval = isCustom ? parseInt(customInterval, 10) : settingsInterval;
    if (!interval || interval < 1) {
      Swal.fire("Invalid", "Interval must be at least 1 minute.", "warning");
      setSettingsSaving(false);
      return;
    }
    const retention = isCustomRetention ? parseInt(customRetention, 10) * 30 : retentionDays;
    if (!retention || retention < 1) {
      Swal.fire("Invalid", "Retention period must be at least 1 day.", "warning");
      setSettingsSaving(false);
      return;
    }
    try {
      const r = await fetch(`${API}/snapshot-settings/`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ interval_minutes: interval, retention_days: retention, apply_to_all: applyToAll }),
      });
      if (r.ok) {
        const data = await r.json();
        setSnapSettings({ ...snapSettings, ...data, device_overrides: applyToAll ? {} : snapSettings.device_overrides });
        setApplyToAll(false);
        Swal.fire({ icon: "success", title: "Settings saved", timer: 1500, showConfirmButton: false });
        setShowSettings(false);
      } else {
        Swal.fire("Error", "Could not save settings.", "error");
      }
    } catch {
      Swal.fire("Error", "Could not save settings.", "error");
    } finally {
      setSettingsSaving(false);
    }
  };

  // ------------------------------------------------------------- activity log
  const openActivityLog = async (device: Device) => {
    setShowActivityLog(true);
    setActivityDevice(device);
    setActivityLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    setActivityDate(today);
    try {
      const [actRes, settRes] = await Promise.all([
        fetch(`${API}/activity/?device=${device.id}&date=${today}`, { headers: authHeaders() }),
        fetch(`${API}/inactivity-settings/`, { headers: authHeaders() }),
      ]);
      if (actRes.ok) { const d = await actRes.json(); setActivityEntries(d.results || d); }
      else setActivityEntries([]);
      if (settRes.ok) { const s = await settRes.json(); setInactivitySettings(s); }
    } catch { setActivityEntries([]); }
    finally { setActivityLoading(false); }
  };

  const loadActivityForDate = async (date: string) => {
    if (!activityDevice) return;
    setActivityDate(date);
    setActivityLoading(true);
    try {
      const r = await fetch(`${API}/activity/?device=${activityDevice.id}&date=${date}`, { headers: authHeaders() });
      if (r.ok) { const d = await r.json(); setActivityEntries(d.results || d); }
      else setActivityEntries([]);
    } catch { setActivityEntries([]); }
    finally { setActivityLoading(false); }
  };

  const saveInactivitySettings = async () => {
    setInactSaving(true);
    try {
      const r = await fetch(`${API}/inactivity-settings/`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(inactivitySettings),
      });
      if (r.ok) {
        const d = await r.json();
        setInactivitySettings(d);
        Swal.fire({ icon: "success", title: "Inactivity settings saved", timer: 1500, showConfirmButton: false });
      } else Swal.fire("Error", "Could not save.", "error");
    } catch { Swal.fire("Error", "Could not save.", "error"); }
    finally { setInactSaving(false); }
  };

  // ------------------------------------------------------------- send message
  const openSendMessage = (device: Device) => {
    setMessageDevice(device);
    setMessageContent("");
    setShowSendMessage(true);
  };

  const sendMessage = async () => {
    if (!messageDevice || !messageContent.trim()) return;
    setMessageSending(true);
    try {
      const r = await fetch(`${API}/messages/send/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ device_id: messageDevice.id, content: messageContent.trim() }),
      });
      if (r.ok) {
        Swal.fire({ icon: "success", title: "Message sent", timer: 1500, showConfirmButton: false });
        setShowSendMessage(false);
        setMessageContent("");
      } else {
        const data = await r.json().catch(() => ({}));
        Swal.fire("Failed", data.detail || `Could not send message (${r.status}).`, "error");
      }
    } catch {
      Swal.fire("Error", "Could not send message.", "error");
    } finally {
      setMessageSending(false);
    }
  };

  const getActivityStatus = (durationSec: number) => {
    const mins = durationSec / 60;
    if (mins >= inactivitySettings.long_interval_threshold_minutes) return { label: "Long Interval", bg: "danger" };
    if (mins >= inactivitySettings.idle_threshold_minutes) return { label: "Idle", bg: "warning" };
    return { label: "Active", bg: "success" };
  };

  const activitySummary = () => {
    let totalActive = 0, totalIdle = 0, totalLong = 0;
    activityEntries.forEach((e) => {
      const mins = e.duration_seconds / 60;
      if (mins >= inactivitySettings.long_interval_threshold_minutes) totalLong += e.duration_seconds;
      else if (mins >= inactivitySettings.idle_threshold_minutes) totalIdle += e.duration_seconds;
      else totalActive += e.duration_seconds;
    });
    const totalTracked = totalActive + totalIdle + totalLong;
    const workdaySec = 8 * 3600;
    const totalOffline = Math.max(0, workdaySec - totalTracked);
    const fmtH = (s: number) => {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };
    return { totalActive: fmtH(totalActive), totalIdle: fmtH(totalIdle), totalLong: fmtH(totalLong), totalOffline: fmtH(totalOffline) };
  };

  useEffect(() => () => { try { wsRef.current?.close(); pcRef.current?.close(); } catch {} }, []);

  const onlineCount = devices.filter((d) => d.is_online).length;

  return (
    <Fragment>
      <DasherBreadcrumb />

      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
        <div>
          <h4 className="mb-1">Live Monitoring</h4>
          <div className="text-muted small">
            {onlineCount} of {devices.length} registered computer{devices.length === 1 ? "" : "s"} online. You can watch a screen; you cannot control it.
          </div>
        </div>
        <div className="d-flex gap-2">
          <Button variant="outline-secondary" size="sm" onClick={openLog}><IconHistory size={16} /> Activity log</Button>
          <Button variant="outline-primary" size="sm" onClick={downloadApp}><IconDownload size={16} /> Download App</Button>
          <Button variant="outline-secondary" size="sm" onClick={loadDevices}><IconRefresh size={16} /> Refresh</Button>
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="bg-white rounded shadow-sm p-0">
        <Table responsive hover className="mb-0 align-middle">
          <thead className="table-light">
            <tr>
              <th>Employee</th><th>Device</th><th>Status</th><th>Last active</th><th className="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-4"><Spinner animation="border" size="sm" /> Loading…</td></tr>
            ) : devices.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-muted py-4">
                No computers registered yet. Install the monitoring app on an employee&apos;s computer and sign in to get started.
              </td></tr>
            ) : (
              devices.map((d) => (
                <tr key={d.id}>
                  <td className="fw-medium">{d.employee_name}</td>
                  <td>{d.device_name || <span className="text-muted">—</span>}</td>
                  <td>
                    {d.is_online
                      ? <span className="text-success">● Online</span>
                      : <span className="text-muted">● Offline</span>}
                    {!d.is_active && <Badge bg="secondary" className="ms-2">revoked</Badge>}
                  </td>
                  <td className="text-muted small">{fmt(d.last_active_at || d.last_seen_at)}</td>
                  <td className="text-end d-flex gap-1 justify-content-end">
                    <Button
                      size="sm"
                      variant="outline-success"
                      disabled={!d.is_online}
                      onClick={() => startWatching(d)}
                      title="Watch Live"
                      style={{ border: "1.5px solid #198754" }}
                    >
                      <IconEye size={16} />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-primary"
                      onClick={() => openSnapshots(d.id)}
                      title="Snapshots"
                    >
                      <IconCamera size={16} />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-info"
                      onClick={() => openActivityLog(d)}
                      title="Activity Log"
                    >
                      <IconActivity size={16} />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-warning"
                      disabled={!d.is_online}
                      onClick={() => openSendMessage(d)}
                      title="Send Message"
                    >
                      <IconMessage size={16} />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      onClick={openSettings}
                      title="Settings"
                    >
                      <IconSettings size={16} />
                    </Button>
                    {d.is_active ? (
                      <Button size="sm" variant="outline-danger" onClick={() => revoke(d)} title="Deregister device">
                        <IconTrash size={16} />
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline-success" onClick={() => unrevoke(d)} title="Reactivate device">
                        <IconRefresh size={16} />
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </div>

      {/* Watch modal */}
      <Modal show={!!watching} onHide={stopWatching} size="xl" centered>
        <Modal.Header closeButton>
          <Modal.Title className="fs-6">
            {watching?.employee_name} — {watching?.device_name}
            <span className="ms-3 small fw-normal text-success">{watchStatus}</span>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="bg-dark p-2">
          <video ref={videoRef} autoPlay playsInline style={{ width: "100%", borderRadius: 8, background: "#000" }} />
        </Modal.Body>
        <Modal.Footer className="py-2">
          <span className="text-muted small me-auto">This view is being recorded in the activity log.</span>
          {watching && (
            <Button variant="warning" size="sm" className="me-2" onClick={() => openSendMessage(watching)}>
              <IconMessage size={16} className="me-1" /> Send Message
            </Button>
          )}
          <Button variant="secondary" onClick={stopWatching}>Stop watching</Button>
        </Modal.Footer>
      </Modal>

      {/* Audit log modal */}
      <Modal show={showLog} onHide={() => setShowLog(false)} size="lg" centered>
        <Modal.Header closeButton><Modal.Title className="fs-6">Monitoring activity log</Modal.Title></Modal.Header>
        <Modal.Body>
          <Table responsive size="sm" hover>
            <thead><tr><th>When</th><th>Admin</th><th>Watched</th><th>Device</th><th>Duration</th></tr></thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-muted py-3">No monitoring sessions recorded yet.</td></tr>
              ) : sessions.map((s) => (
                <tr key={s.id}>
                  <td className="small">{fmt(s.started_at)}</td>
                  <td className="small">{s.viewer_email}</td>
                  <td className="small">{s.watched_user_email}</td>
                  <td className="small">{s.device_label}</td>
                  <td className="small">{fmtDur(s.duration_seconds)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Modal.Body>
      </Modal>

      {/* Snapshots modal */}
      <Modal show={showSnapshots} onHide={() => { setShowSnapshots(false); setPreviewImage(null); }} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title className="fs-6">Snapshots</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="mb-3">
            <Form.Select
              size="sm"
              value={snapshotDevice}
              onChange={(e) => loadSnapshotsForDevice(e.target.value)}
              style={{ maxWidth: 300 }}
            >
              <option value="">All devices</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.employee_name} — {d.device_name}</option>
              ))}
            </Form.Select>
          </div>

          {previewImage ? (
            <div className="text-center">
              <Button variant="link" size="sm" className="mb-2" onClick={() => setPreviewImage(null)}>← Back to list</Button>
              <img
                src={previewImage}
                alt="Snapshot"
                style={{ width: "100%", borderRadius: 8, border: "1px solid #dee2e6" }}
              />
            </div>
          ) : snapshotsLoading ? (
            <div className="text-center py-4"><Spinner animation="border" size="sm" /> Loading…</div>
          ) : snapshots.length === 0 ? (
            <div className="text-center text-muted py-4">No snapshots captured yet.</div>
          ) : (
            <div className="row g-2">
              {snapshots.map((snap) => (
                <div key={snap.id} className="col-6 col-md-4">
                  <div
                    className="border rounded overflow-hidden"
                    style={{ cursor: "pointer" }}
                    onClick={() => setPreviewImage(snap.image)}
                  >
                    <img
                      src={snap.image}
                      alt={`${snap.employee_name} snapshot`}
                      style={{ width: "100%", height: 140, objectFit: "cover" }}
                    />
                    <div className="p-2 small">
                      <div className="fw-medium">{snap.employee_name}</div>
                      <div className="text-muted">{fmt(snap.captured_at)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal.Body>
      </Modal>

      {/* Activity Log modal */}
      <Modal show={showActivityLog} onHide={() => setShowActivityLog(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title className="fs-6">
            Activity Log — {activityDevice?.employee_name} ({activityDevice?.device_name})
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-flex gap-3 align-items-center mb-3">
            <Form.Control
              type="date"
              value={activityDate}
              onChange={(e) => loadActivityForDate(e.target.value)}
              style={{ maxWidth: 200 }}
            />
          </div>

          {/* Daily summary */}
          {!activityLoading && activityEntries.length > 0 && (() => {
            const s = activitySummary();
            return (
              <div className="d-flex flex-wrap gap-3 mb-3">
                <div className="border rounded px-3 py-2 text-center" style={{ minWidth: 120 }}>
                  <div className="text-success fw-bold">{s.totalActive}</div>
                  <div className="text-muted small">Active</div>
                </div>
                <div className="border rounded px-3 py-2 text-center" style={{ minWidth: 120 }}>
                  <div className="text-warning fw-bold">{s.totalIdle}</div>
                  <div className="text-muted small">Idle</div>
                </div>
                <div className="border rounded px-3 py-2 text-center" style={{ minWidth: 120 }}>
                  <div className="text-danger fw-bold">{s.totalLong}</div>
                  <div className="text-muted small">Long Interval</div>
                </div>
                <div className="border rounded px-3 py-2 text-center" style={{ minWidth: 120 }}>
                  <div className="text-secondary fw-bold">{s.totalOffline}</div>
                  <div className="text-muted small">Offline</div>
                </div>
              </div>
            );
          })()}

          {/* Activity timeline */}
          {activityLoading ? (
            <div className="text-center py-4"><Spinner animation="border" size="sm" /> Loading…</div>
          ) : activityEntries.length === 0 ? (
            <div className="text-center text-muted py-4">No activity recorded for this date.</div>
          ) : (
            <div style={{ maxHeight: 400, overflowY: "auto" }}>
              <Table responsive size="sm" hover>
                <thead className="table-light">
                  <tr>
                    <th>Time</th>
                    <th>Application / Website</th>
                    <th>Duration</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activityEntries.map((e) => {
                    const st = getActivityStatus(e.duration_seconds);
                    const timeStr = new Date(e.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                    const display = e.url || e.title || e.app_name || "Unknown";
                    return (
                      <tr key={e.id}>
                        <td className="small text-nowrap">{timeStr}</td>
                        <td className="small">
                          <div className="fw-medium">{display}</div>
                          {e.url && e.app_name && <div className="text-muted" style={{ fontSize: 11 }}>{e.app_name}</div>}
                          {!e.url && e.app_name && e.title && <div className="text-muted" style={{ fontSize: 11 }}>{e.app_name}</div>}
                        </td>
                        <td className="small text-nowrap">{fmtDur(e.duration_seconds)}</td>
                        <td><Badge bg={st.bg} className="text-uppercase" style={{ fontSize: 10 }}>{st.label}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}

          {/* Inactivity module settings */}
          <hr />
          <h6 className="fw-bold mb-3">Inactivity Module Settings</h6>
          <div className="d-flex flex-wrap gap-3 mb-3">
            <div>
              <Form.Label className="small mb-1">Idle threshold (minutes)</Form.Label>
              <Form.Control
                type="number"
                min={1}
                value={inactivitySettings.idle_threshold_minutes}
                onChange={(e) => setInactivitySettings({ ...inactivitySettings, idle_threshold_minutes: parseInt(e.target.value, 10) || 1 })}
                style={{ maxWidth: 120 }}
              />
              <div className="text-muted" style={{ fontSize: 11 }}>Inactivity above this = Idle</div>
            </div>
            <div>
              <Form.Label className="small mb-1">Long interval threshold (minutes)</Form.Label>
              <Form.Control
                type="number"
                min={1}
                value={inactivitySettings.long_interval_threshold_minutes}
                onChange={(e) => setInactivitySettings({ ...inactivitySettings, long_interval_threshold_minutes: parseInt(e.target.value, 10) || 1 })}
                style={{ maxWidth: 120 }}
              />
              <div className="text-muted" style={{ fontSize: 11 }}>Inactivity above this = Long Interval</div>
            </div>
          </div>
          <Button size="sm" variant="primary" onClick={saveInactivitySettings} disabled={inactSaving}>
            {inactSaving ? <Spinner animation="border" size="sm" /> : "Save Inactivity Settings"}
          </Button>
        </Modal.Body>
      </Modal>

      {/* Send Message modal */}
      <Modal show={showSendMessage} onHide={() => setShowSendMessage(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="fs-6">
            Send Message — {messageDevice?.employee_name}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted small mb-3">
            This message will appear as a popup on the employee&apos;s screen. They must click OK to dismiss it.
          </p>
          <Form.Group>
            <Form.Label className="fw-medium">Message</Form.Label>
            <Form.Control
              as="textarea"
              rows={4}
              placeholder="Type your message here…"
              value={messageContent}
              onChange={(e) => setMessageContent(e.target.value)}
              maxLength={1000}
            />
            <div className="text-muted small mt-1 text-end">{messageContent.length}/1000</div>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setShowSendMessage(false)}>Cancel</Button>
          <Button
            variant="primary"
            size="sm"
            onClick={sendMessage}
            disabled={messageSending || !messageContent.trim()}
          >
            {messageSending ? <Spinner animation="border" size="sm" /> : "Send Message"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Settings modal */}
      <Modal show={showSettings} onHide={() => setShowSettings(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="fs-6">Snapshot Settings</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted small mb-3">
            Set how often automatic screenshots are captured from monitored devices. Default is 30 minutes.
          </p>
          <Form.Label className="fw-medium mb-2">Snapshot interval</Form.Label>
          <div className="d-flex flex-wrap gap-2 mb-3">
            {INTERVAL_OPTIONS.map((m) => (
              <Button
                key={m}
                size="sm"
                variant={!isCustom && settingsInterval === m ? "primary" : "outline-secondary"}
                onClick={() => { setSettingsInterval(m); setIsCustom(false); setCustomInterval(""); }}
              >
                {m < 60 ? `${m} min` : `${m / 60} hour`}
              </Button>
            ))}
            <Button
              size="sm"
              variant={isCustom ? "primary" : "outline-secondary"}
              onClick={() => { setIsCustom(true); setSettingsInterval(0); }}
            >
              Custom
            </Button>
          </div>

          {isCustom && (
            <div className="mb-3">
              <Form.Label className="small">Custom interval (in minutes)</Form.Label>
              <Form.Control
                type="number"
                min={1}
                placeholder="e.g. 45"
                value={customInterval}
                onChange={(e) => setCustomInterval(e.target.value)}
                style={{ maxWidth: 200 }}
              />
            </div>
          )}

          <hr />

          <Form.Label className="fw-medium mb-2">Auto-delete snapshots after</Form.Label>
          <div className="d-flex flex-wrap gap-2 mb-3">
            {RETENTION_OPTIONS.map((opt) => (
              <Button
                key={opt.days}
                size="sm"
                variant={!isCustomRetention && retentionDays === opt.days ? "primary" : "outline-secondary"}
                onClick={() => { setRetentionDays(opt.days); setIsCustomRetention(false); setCustomRetention(""); }}
              >
                {opt.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant={isCustomRetention ? "primary" : "outline-secondary"}
              onClick={() => { setIsCustomRetention(true); setRetentionDays(0); }}
            >
              Custom
            </Button>
          </div>

          {isCustomRetention && (
            <div className="mb-3">
              <Form.Label className="small">Custom retention (in months)</Form.Label>
              <Form.Control
                type="number"
                min={1}
                placeholder="e.g. 6"
                value={customRetention}
                onChange={(e) => setCustomRetention(e.target.value)}
                style={{ maxWidth: 200 }}
              />
            </div>
          )}

          <div className="text-muted small mb-3" style={{ background: "#f8f9fa", padding: "8px 12px", borderRadius: 6 }}>
            Snapshots older than the selected period will be permanently deleted from the server to save storage.
          </div>

          <hr />
          <Form.Check
            type="checkbox"
            id="apply-to-all"
            label="Update for all users"
            className="mb-1"
            checked={applyToAll}
            onChange={(e) => setApplyToAll(e.target.checked)}
          />
          <div className="text-muted small ms-4">
            When checked, this interval will apply to all devices and remove any per-device overrides.
          </div>

          <hr />

          <Form.Label className="fw-medium mb-2">Manage Devices</Form.Label>
          <div className="text-muted small mb-2">Permanently delete a device and all its snapshots. This cannot be undone.</div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {devices.length === 0 ? (
              <div className="text-muted small py-2">No devices registered.</div>
            ) : (
              devices.map((d) => (
                <div key={d.id} className="d-flex align-items-center justify-content-between py-2 border-bottom">
                  <div>
                    <div className="fw-medium small">{d.employee_name}</div>
                    <div className="text-muted" style={{ fontSize: 12 }}>{d.device_name}{!d.is_active && " (revoked)"}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline-danger"
                    onClick={() => { setShowSettings(false); deleteDevice(d); }}
                  >
                    <IconTrash size={14} /> Delete
                  </Button>
                </div>
              ))
            )}
          </div>

          <hr />

          <Form.Label className="fw-medium mb-2">Uninstall Protection</Form.Label>
          <div className="text-muted small mb-2">
            Require a password before the monitoring app can be quit or uninstalled from an employee&apos;s computer.
          </div>

          {uninstallPwSet ? (
            <div className="d-flex align-items-center gap-2 mb-2">
              <Badge bg="success">Password is set</Badge>
              <Button size="sm" variant="outline-warning" onClick={() => setUninstallPwSet(false)}>
                Change
              </Button>
              <Button size="sm" variant="outline-danger" onClick={removeUninstallPassword}>
                Remove
              </Button>
            </div>
          ) : (
            <div>
              <div className="d-flex flex-wrap gap-2 mb-2">
                <Form.Control
                  type="password"
                  placeholder="New password"
                  value={uninstallPw}
                  onChange={(e) => setUninstallPw(e.target.value)}
                  style={{ maxWidth: 180 }}
                  size="sm"
                />
                <Form.Control
                  type="password"
                  placeholder="Confirm password"
                  value={uninstallPwConfirm}
                  onChange={(e) => setUninstallPwConfirm(e.target.value)}
                  style={{ maxWidth: 180 }}
                  size="sm"
                />
              </div>
              <Button size="sm" variant="primary" onClick={saveUninstallPassword} disabled={uninstallSaving}>
                {uninstallSaving ? <Spinner animation="border" size="sm" /> : "Set Uninstall Password"}
              </Button>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setShowSettings(false)}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={saveSettings} disabled={settingsSaving}>
            {settingsSaving ? <Spinner animation="border" size="sm" /> : "Save"}
          </Button>
        </Modal.Footer>
      </Modal>
    </Fragment>
  );
}
