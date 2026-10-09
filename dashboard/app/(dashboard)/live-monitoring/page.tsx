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
import { Button, Modal, Table, Spinner, Badge, Alert } from "react-bootstrap";
import {
  IconRefresh,
  IconDownload,
  IconEye,
  IconHistory,
  IconTrash,
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

const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");
const fmtDur = (s: number | null) =>
  s == null ? "live / —" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;

export default function LiveMonitoringPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [watching, setWatching] = useState<Device | null>(null);
  const [watchStatus, setWatchStatus] = useState("");

  const [showLog, setShowLog] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);

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
    const id = setInterval(loadDevices, 8000); // keep presence fresh
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
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "AttendStackMonitor-Setup.exe";
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
                No computers registered yet. Install the monitoring app on an employee's computer and sign in to get started.
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
                  <td className="text-end">
                    <Button size="sm" variant="primary" className="me-2" disabled={!d.is_online} onClick={() => startWatching(d)}>
                      <IconEye size={16} /> Watch Live
                    </Button>
                    {d.is_active && (
                      <Button size="sm" variant="outline-danger" onClick={() => revoke(d)} title="Deregister device">
                        <IconTrash size={16} />
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
    </Fragment>
  );
}
