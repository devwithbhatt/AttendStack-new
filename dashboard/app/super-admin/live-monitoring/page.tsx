"use client";

/**
 * Live Monitoring — Super Admin
 *
 * Separate from the Company Admin Live Monitoring (app/(dashboard)/live-monitoring),
 * which this page does not use or change.
 *
 * The Super Admin issues monitor-app credentials (5-digit User ID + password +
 * passkey, shown once), hands the installer to the person, and can watch the
 * screens of computers signed in with those credentials. Watching is read-only:
 * the video is WebRTC peer-to-peer and this page only relays the handshake over
 * ws/platform-monitor/view/<id>/. Every view is recorded in the activity log.
 */

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Form, Modal, Nav, Spinner, Table } from "react-bootstrap";
import {
  IconCopy,
  IconCheck,
  IconDeviceDesktop,
  IconDownload,
  IconEye,
  IconHistory,
  IconKey,
  IconRefresh,
  IconTrash,
  IconUserCheck,
  IconUserOff,
  IconUserPlus,
  IconLogout,
} from "@tabler/icons-react";
import Swal from "sweetalert2";
import apiClient from "app/services/api";
import DasherBreadcrumb from "components/common/DasherBreadcrumb";

const API = "/api/v1/platform-monitoring";
const INSTALLER_NAME = "BhattSquareWatch.exe";

const wsHost = () => {
  const raw = (process.env.NEXT_PUBLIC_API_ENDPOINT || "").trim();
  try {
    return raw.startsWith("http") ? new URL(raw).host : raw;
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
};

interface Account {
  id: string;
  user_id: string;
  name: string;
  note: string;
  is_active: boolean;
  is_locked: boolean;
  device_count: number;
  online_count: number;
  created_by_email: string | null;
  created_at: string;
  credentials_reset_at: string | null;
  last_signin_at: string | null;
}
interface Device {
  id: string;
  account_id: string;
  account_user_id: string;
  account_name: string;
  account_is_active: boolean;
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
  account_user_id: string;
  account_name: string;
  device_label: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
}
interface IssuedCredentials {
  heading: string;
  name: string;
  user_id: string;
  password: string;
  passkey: string;
}

const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");
const fmtDur = (s: number | null) =>
  s == null ? "live / —" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
const errorText = (e: any, fallback: string) => e?.response?.data?.detail || e?.response?.data?.name?.[0] || fallback;

export default function SuperAdminLiveMonitoringPage() {
  const [tab, setTab] = useState<"users" | "computers">("users");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", note: "" });
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);
  const [copied, setCopied] = useState(false);

  const [watching, setWatching] = useState<Device | null>(null);
  const [watchStatus, setWatchStatus] = useState("");
  const [showLog, setShowLog] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // ------------------------------------------------------------ data
  const load = useCallback(async () => {
    try {
      const [a, d] = await Promise.all([apiClient.get(`${API}/accounts/`), apiClient.get(`${API}/devices/`)]);
      setAccounts(a.data.results || a.data);
      setDevices(d.data.results || d.data);
      setError("");
    } catch (e: any) {
      setError(errorText(e, "Could not load Live Monitoring data."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000); // keep presence fresh
    return () => clearInterval(id);
  }, [load]);

  // ------------------------------------------------------- accounts
  const createAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const r = await apiClient.post(`${API}/accounts/`, createForm);
      setShowCreate(false);
      setCreateForm({ name: "", note: "" });
      setCopied(false);
      setIssued({ heading: "User created", name: r.data.account.name, ...r.data.credentials });
      load();
    } catch (err: any) {
      Swal.fire("Could not create user", errorText(err, "Please try again."), "error");
    } finally {
      setCreating(false);
    }
  };

  const resetCredentials = async (a: Account) => {
    const ok = await Swal.fire({
      title: `Reset credentials for ${a.name}?`,
      text: `User ID ${a.user_id} stays the same. A new password and passkey are generated and the old ones stop working immediately. Computers already signed in stay signed in.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Reset",
    });
    if (!ok.isConfirmed) return;
    try {
      const r = await apiClient.post(`${API}/accounts/${a.id}/reset-credentials/`);
      setCopied(false);
      setIssued({ heading: "New credentials", name: r.data.account.name, ...r.data.credentials });
      load();
    } catch (err: any) {
      Swal.fire("Reset failed", errorText(err, "Please try again."), "error");
    }
  };

  const toggleActive = async (a: Account) => {
    const disabling = a.is_active;
    const ok = await Swal.fire({
      title: `${disabling ? "Disable" : "Enable"} ${a.name}?`,
      text: disabling
        ? "They can't sign in, and their computers are signed out and stop streaming right away."
        : "They can sign in again, and their computers reconnect automatically.",
      icon: disabling ? "warning" : "question",
      showCancelButton: true,
      confirmButtonText: disabling ? "Disable" : "Enable",
      confirmButtonColor: disabling ? "#ef4444" : undefined,
    });
    if (!ok.isConfirmed) return;
    try {
      await apiClient.patch(`${API}/accounts/${a.id}/`, { is_active: !a.is_active });
      load();
    } catch (err: any) {
      Swal.fire("Failed", errorText(err, "Please try again."), "error");
    }
  };

  const deleteAccount = async (a: Account) => {
    const ok = await Swal.fire({
      title: `Delete ${a.name} (${a.user_id})?`,
      text: "The account and its computers are removed permanently. The activity log is kept.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#ef4444",
    });
    if (!ok.isConfirmed) return;
    try {
      await apiClient.delete(`${API}/accounts/${a.id}/`);
      load();
    } catch (err: any) {
      Swal.fire("Delete failed", errorText(err, "Please try again."), "error");
    }
  };

  const credentialsText = (c: IssuedCredentials) =>
    `Bhatt Square Watch\nUser ID: ${c.user_id}\nPassword: ${c.password}\nPasskey: ${c.passkey}`;

  const copyCredentials = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(credentialsText(issued));
      setCopied(true);
    } catch {
      Swal.fire("Copy failed", "Select the details and copy them manually.", "info");
    }
  };

  const closeIssued = async () => {
    if (!copied) {
      const ok = await Swal.fire({
        title: "Close without copying?",
        text: "The password and passkey can't be shown again. You'd need to reset them.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Close anyway",
      });
      if (!ok.isConfirmed) return;
    }
    setIssued(null);
  };

  // ------------------------------------------------------- computers
  const revokeDevice = async (d: Device) => {
    const ok = await Swal.fire({
      title: "Sign out this computer?",
      text: `${d.account_name} — ${d.device_name || "computer"}. It stops streaming and must sign in again with the credentials.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sign out",
      confirmButtonColor: "#ef4444",
    });
    if (!ok.isConfirmed) return;
    try {
      await apiClient.post(`${API}/devices/${d.id}/revoke/`);
      load();
    } catch (err: any) {
      Swal.fire("Failed", errorText(err, "Please try again."), "error");
    }
  };

  const stopWatching = useCallback(() => {
    try { wsRef.current?.close(); } catch {}
    try { pcRef.current?.close(); } catch {}
    wsRef.current = null;
    pcRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setWatching(null);
    setWatchStatus("");
    load();
  }, [load]);

  const startWatching = (device: Device) => {
    setWatching(device);
    setWatchStatus("Connecting…");
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const token = localStorage.getItem("authToken") || "";
    const ws = new WebSocket(`${proto}//${wsHost()}/ws/platform-monitor/view/${device.id}/?token=${encodeURIComponent(token)}`);
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
    ws.onclose = () => setWatchStatus((s) => (s === "● Live" ? "Stream ended / computer went offline." : s || "Disconnected."));
    ws.onerror = () => setWatchStatus("Connection error (computer offline or access denied).");
  };

  useEffect(() => () => { try { wsRef.current?.close(); pcRef.current?.close(); } catch {} }, []);

  // ------------------------------------------------------- download / log
  const downloadApp = async () => {
    try {
      const r = await apiClient.get(`${API}/agent/download/`, { responseType: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(r.data);
      a.download = INSTALLER_NAME;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        Swal.fire("Not available yet", "The Bhatt Square Watch installer hasn't been published yet.", "info");
      } else {
        Swal.fire("Download failed", "Please try again.", "error");
      }
    }
  };

  const openLog = async () => {
    setShowLog(true);
    try {
      const r = await apiClient.get(`${API}/sessions/`);
      setSessions(r.data.results || r.data);
    } catch {
      setSessions([]);
    }
  };

  const onlineCount = devices.filter((d) => d.is_online).length;
  const activeDevices = devices.filter((d) => d.is_active);

  return (
    <Fragment>
      <DasherBreadcrumb />

      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
        <div>
          <h4 className="mb-1">Live Monitoring</h4>
          <div className="text-muted small">
            {accounts.length} user{accounts.length === 1 ? "" : "s"} · {onlineCount} of {activeDevices.length} computer{activeDevices.length === 1 ? "" : "s"} online. You can watch a screen; you cannot control it.
          </div>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <Button variant="outline-secondary" size="sm" onClick={openLog}><IconHistory size={16} /> Activity log</Button>
          <Button variant="outline-primary" size="sm" onClick={downloadApp}><IconDownload size={16} /> Download App</Button>
          <Button variant="outline-secondary" size="sm" onClick={load}><IconRefresh size={16} /> Refresh</Button>
          <Button variant="warning" size="sm" className="fw-semibold text-dark" onClick={() => setShowCreate(true)}>
            <IconUserPlus size={16} /> Create User
          </Button>
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <Nav variant="pills" className="mb-3 gap-2" activeKey={tab} onSelect={(k) => setTab((k as "users" | "computers") || "users")}>
        <Nav.Item><Nav.Link eventKey="users" className="py-1 px-3">Users ({accounts.length})</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="computers" className="py-1 px-3">Computers ({activeDevices.length})</Nav.Link></Nav.Item>
      </Nav>

      <Card className="border-0 shadow-sm">
        <Card.Body className="p-0">
          {tab === "users" ? (
            <Table responsive hover className="mb-0 align-middle">
              <thead className="table-light">
                <tr><th>User ID</th><th>Name</th><th>Status</th><th>Computers</th><th>Last sign-in</th><th>Created</th><th className="text-end">Actions</th></tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-4"><Spinner animation="border" size="sm" /> Loading…</td></tr>
                ) : accounts.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-muted py-4">
                    No users yet. Click <strong>Create User</strong> to issue a User ID, password and passkey.
                  </td></tr>
                ) : accounts.map((a) => (
                  <tr key={a.id}>
                    <td className="fw-semibold font-monospace">{a.user_id}</td>
                    <td>
                      <div className="fw-medium">{a.name}</div>
                      {a.note && <div className="text-muted small">{a.note}</div>}
                    </td>
                    <td>
                      {a.is_active ? <Badge bg="success-subtle" text="success">Active</Badge> : <Badge bg="secondary">Disabled</Badge>}
                      {a.is_locked && <Badge bg="warning" text="dark" className="ms-1" title="Too many wrong attempts; unlocks automatically after 15 minutes, or reset credentials.">Locked</Badge>}
                    </td>
                    <td>
                      {a.device_count}
                      {a.online_count > 0 && <span className="text-success small ms-2">● {a.online_count} online</span>}
                    </td>
                    <td className="text-muted small">{fmt(a.last_signin_at)}</td>
                    <td className="text-muted small">{fmt(a.created_at)}</td>
                    <td className="text-end text-nowrap">
                      <Button size="sm" variant="outline-primary" className="me-1" onClick={() => resetCredentials(a)} title="Reset password & passkey">
                        <IconKey size={16} /> Reset
                      </Button>
                      <Button size="sm" variant={a.is_active ? "outline-secondary" : "outline-success"} className="me-1" onClick={() => toggleActive(a)} title={a.is_active ? "Disable" : "Enable"}>
                        {a.is_active ? <><IconUserOff size={16} /> Disable</> : <><IconUserCheck size={16} /> Enable</>}
                      </Button>
                      <Button size="sm" variant="outline-danger" onClick={() => deleteAccount(a)} title="Delete">
                        <IconTrash size={16} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <Table responsive hover className="mb-0 align-middle">
              <thead className="table-light">
                <tr><th>User</th><th>Computer</th><th>Status</th><th>Last active</th><th className="text-end">Actions</th></tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="text-center py-4"><Spinner animation="border" size="sm" /> Loading…</td></tr>
                ) : activeDevices.length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-muted py-4">
                    No computers signed in yet. Install the app on the person's computer and sign in with their User ID, password and passkey.
                  </td></tr>
                ) : activeDevices.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div className="fw-medium">{d.account_name}</div>
                      <div className="text-muted small font-monospace">{d.account_user_id}</div>
                    </td>
                    <td><IconDeviceDesktop size={16} className="me-1 text-muted" />{d.device_name || <span className="text-muted">—</span>}</td>
                    <td>
                      {d.is_online ? <span className="text-success">● Online</span> : <span className="text-muted">● Offline</span>}
                      {!d.account_is_active && <Badge bg="secondary" className="ms-2">user disabled</Badge>}
                    </td>
                    <td className="text-muted small">{fmt(d.last_active_at || d.last_seen_at)}</td>
                    <td className="text-end text-nowrap">
                      <Button size="sm" variant="primary" className="me-2" disabled={!d.is_online} onClick={() => startWatching(d)}>
                        <IconEye size={16} /> Watch Live
                      </Button>
                      <Button size="sm" variant="outline-danger" onClick={() => revokeDevice(d)} title="Sign out this computer">
                        <IconLogout size={16} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      {/* Create user */}
      <Modal show={showCreate} onHide={() => setShowCreate(false)} centered>
        <Form onSubmit={createAccount}>
          <Modal.Header closeButton><Modal.Title className="fs-6">Create monitoring user</Modal.Title></Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Name <span className="text-danger">*</span></Form.Label>
              <Form.Control
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="Who will use this computer"
                maxLength={150}
                required
                autoFocus
              />
            </Form.Group>
            <Form.Group>
              <Form.Label>Note <span className="text-muted small">(optional)</span></Form.Label>
              <Form.Control
                value={createForm.note}
                onChange={(e) => setCreateForm({ ...createForm, note: e.target.value })}
                placeholder="e.g. Reception PC, Delhi office"
                maxLength={255}
              />
            </Form.Group>
            <div className="text-muted small mt-3">
              A 5-digit User ID, a password and a passkey are generated for you. They are shown once on the next screen.
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="light" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" variant="warning" className="fw-semibold text-dark" disabled={creating || !createForm.name.trim()}>
              {creating ? <Spinner animation="border" size="sm" /> : "Create"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Credentials, shown once */}
      <Modal show={!!issued} onHide={closeIssued} centered backdrop="static">
        <Modal.Header closeButton><Modal.Title className="fs-6">{issued?.heading} — {issued?.name}</Modal.Title></Modal.Header>
        <Modal.Body>
          <Alert variant="warning" className="small py-2">
            Copy these now and send them to the person. The password and passkey <strong>can't be shown again</strong> — if they're lost, use Reset.
          </Alert>
          {issued && (
            <Table bordered size="sm" className="mb-0 font-monospace">
              <tbody>
                <tr><th className="w-25 font-sans-serif">User ID</th><td className="fs-5">{issued.user_id}</td></tr>
                <tr><th className="font-sans-serif">Password</th><td className="fs-5">{issued.password}</td></tr>
                <tr><th className="font-sans-serif">Passkey</th><td className="fs-5">{issued.passkey}</td></tr>
              </tbody>
            </Table>
          )}
          <div className="text-muted small mt-2">All three are case-sensitive and must be typed exactly, including the dash in the passkey.</div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant={copied ? "success" : "primary"} onClick={copyCredentials}>
            {copied ? <><IconCheck size={16} /> Copied</> : <><IconCopy size={16} /> Copy all</>}
          </Button>
          <Button variant="light" onClick={closeIssued}>Done</Button>
        </Modal.Footer>
      </Modal>

      {/* Watch */}
      <Modal show={!!watching} onHide={stopWatching} size="xl" centered>
        <Modal.Header closeButton>
          <Modal.Title className="fs-6">
            {watching?.account_name} ({watching?.account_user_id}) — {watching?.device_name}
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

      {/* Activity log */}
      <Modal show={showLog} onHide={() => setShowLog(false)} size="lg" centered>
        <Modal.Header closeButton><Modal.Title className="fs-6">Monitoring activity log</Modal.Title></Modal.Header>
        <Modal.Body>
          <Table responsive size="sm" hover>
            <thead><tr><th>When</th><th>Watched by</th><th>User</th><th>Computer</th><th>Duration</th></tr></thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-muted py-3">No monitoring sessions recorded yet.</td></tr>
              ) : sessions.map((s) => (
                <tr key={s.id}>
                  <td className="small">{fmt(s.started_at)}</td>
                  <td className="small">{s.viewer_email}</td>
                  <td className="small">{s.account_name} <span className="text-muted font-monospace">({s.account_user_id})</span></td>
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
