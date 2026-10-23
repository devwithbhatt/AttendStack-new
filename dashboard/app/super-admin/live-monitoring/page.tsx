"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Form, Modal, Nav, Spinner, Table } from "react-bootstrap";
import {
  IconCopy,
  IconCheck,
  IconCamera,
  IconDeviceDesktop,
  IconDownload,
  IconEye,
  IconHistory,
  IconKey,
  IconLock,
  IconLockOpen,
  IconMessage,
  IconRefresh,
  IconSettings,
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
const INSTALLER_NAME = "ZuperHRMonitor-Setup.exe";

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
interface SnapshotItem {
  id: string;
  device: string;
  device_name: string;
  account_name: string;
  account_user_id: string;
  image: string;
  captured_at: string;
}
interface ActivityEntry {
  id: string;
  device: string;
  device_name: string;
  account_name: string;
  account_user_id: string;
  title: string;
  app_name: string;
  url: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
}
interface TimelineRow {
  type: "active" | "idle" | "long_interval";
  label: string;
  time: string;
  duration_seconds: number;
  url?: string;
}

const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");
const fmtDur = (s: number | null) =>
  s == null ? "live / —" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
const fmtHM = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
const errorText = (e: any, fallback: string) => e?.response?.data?.detail || e?.response?.data?.name?.[0] || fallback;

const INTERVAL_OPTIONS = [5, 10, 15, 30, 60];
const RETENTION_OPTIONS = [
  { label: "15 days", days: 15 },
  { label: "45 days", days: 45 },
  { label: "3 months", days: 90 },
  { label: "8 months", days: 240 },
];

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

  // Snapshots
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [snapshotDevice, setSnapshotDevice] = useState<string>("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Settings (per-user modal)
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInterval, setSettingsInterval] = useState(30);
  const [customInterval, setCustomInterval] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [retentionDays, setRetentionDays] = useState(90);
  const [isCustomRetention, setIsCustomRetention] = useState(false);
  const [customRetention, setCustomRetention] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [idleThreshold, setIdleThreshold] = useState(3);
  const [longIntervalThreshold, setLongIntervalThreshold] = useState(10);

  // Activity log (per-user)
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityDate, setActivityDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Messaging
  const [showComposer, setShowComposer] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageStatuses, setMessageStatuses] = useState<Record<string, string>>({});

  // Uninstall protection
  const [uninstallPasswordSet, setUninstallPasswordSet] = useState(false);
  const [newUninstallPassword, setNewUninstallPassword] = useState("");
  const [savingUninstallPassword, setSavingUninstallPassword] = useState(false);

  // Selected user context for per-user modals
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

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
    const id = setInterval(load, 8000);
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
      text: `User ID ${a.user_id} stays the same. A new password and passkey are generated and the old ones stop working immediately.`,
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
      title: `Permanently delete ${a.name} (${a.user_id})?`,
      text: "The account and its computers are removed permanently. This cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete permanently",
      confirmButtonColor: "#ef4444",
    });
    if (!ok.isConfirmed) return;
    try {
      await apiClient.delete(`${API}/accounts/${a.id}/`);
      setShowSettings(false);
      load();
    } catch (err: any) {
      Swal.fire("Delete failed", errorText(err, "Please try again."), "error");
    }
  };

  const credentialsText = (c: IssuedCredentials) =>
    `ZuperHR Monitor\nUser ID: ${c.user_id}\nPassword: ${c.password}\nPasskey: ${c.passkey}`;

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
      text: `${d.account_name} — ${d.device_name || "computer"}. It stops streaming and must sign in again.`,
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

  const sendMessage = async () => {
    if (!watching || !messageText.trim() || sendingMessage) return;
    setSendingMessage(true);
    try {
      const r = await apiClient.post(`${API}/messages/send/`, { device_id: watching.id, content: messageText.trim() });
      const msgId = r.data.id;
      setMessageStatuses((prev) => ({ ...prev, [msgId]: r.data.status }));
      setMessageText("");
      setShowComposer(false);
      Swal.fire({ icon: "success", title: "Message sent", text: `Status: ${r.data.status}`, timer: 2000, showConfirmButton: false });
    } catch (err: any) {
      Swal.fire("Failed", errorText(err, "Could not send message."), "error");
    } finally {
      setSendingMessage(false);
    }
  };

  const startWatching = (device: Device) => {
    setWatching(device);
    setWatchStatus("Connecting…");
    setMessageStatuses({});
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
      } else if (msg.type === "message_acknowledged" && msg.message_id) {
        setMessageStatuses((prev) => ({ ...prev, [msg.message_id]: "ACKNOWLEDGED" }));
      }
    };
    ws.onclose = () => setWatchStatus((s) => (s === "● Live" ? "Stream ended / computer went offline." : s || "Disconnected."));
    ws.onerror = () => setWatchStatus("Connection error (computer offline or access denied).");
  };

  useEffect(() => () => { try { wsRef.current?.close(); pcRef.current?.close(); } catch {} }, []);

  // ------------------------------------------------ per-user: watch live
  const watchUserLive = (a: Account) => {
    const onlineDevs = devices.filter((d) => d.account_id === a.id && d.is_online);
    if (onlineDevs.length === 0) return;
    startWatching(onlineDevs[0]);
  };

  // ------------------------------------------------ per-user: snapshots
  const openUserSnapshots = async (a: Account) => {
    setSelectedAccount(a);
    setShowSnapshots(true);
    setSnapshotsLoading(true);
    setSnapshotDevice("");
    setPreviewImage(null);
    try {
      const r = await apiClient.get(`${API}/snapshots/?account=${a.id}`);
      setSnapshots(r.data.results || r.data);
    } catch { setSnapshots([]); }
    finally { setSnapshotsLoading(false); }
  };

  const openSnapshots = async (deviceId?: string) => {
    setSelectedAccount(null);
    setShowSnapshots(true);
    setSnapshotsLoading(true);
    setSnapshotDevice(deviceId || "");
    setPreviewImage(null);
    try {
      const url = deviceId ? `${API}/snapshots/?device=${deviceId}` : `${API}/snapshots/`;
      const r = await apiClient.get(url);
      setSnapshots(r.data.results || r.data);
    } catch { setSnapshots([]); }
    finally { setSnapshotsLoading(false); }
  };

  const loadSnapshotsForDevice = async (deviceId: string) => {
    setSnapshotsLoading(true);
    setSnapshotDevice(deviceId);
    try {
      const base = selectedAccount ? `${API}/snapshots/?account=${selectedAccount.id}` : `${API}/snapshots/`;
      const url = deviceId ? (selectedAccount ? `${base}&device=${deviceId}` : `${API}/snapshots/?device=${deviceId}`) : base;
      const r = await apiClient.get(url);
      setSnapshots(r.data.results || r.data);
    } catch { setSnapshots([]); }
    finally { setSnapshotsLoading(false); }
  };

  // ------------------------------------------------ per-user: settings
  const openUserSettings = async (a: Account) => {
    setSelectedAccount(a);
    setShowSettings(true);
    setNewUninstallPassword("");
    try {
      const [snapRes, inactRes, upRes] = await Promise.all([
        apiClient.get(`${API}/snapshot-settings/`),
        apiClient.get(`${API}/inactivity-settings/`),
        apiClient.get(`${API}/uninstall-password/`),
      ]);
      setUninstallPasswordSet(upRes.data?.is_set || false);
      if (snapRes.data) {
        const interval = snapRes.data.interval_minutes;
        if (INTERVAL_OPTIONS.includes(interval)) {
          setSettingsInterval(interval);
          setIsCustom(false);
          setCustomInterval("");
        } else {
          setIsCustom(true);
          setCustomInterval(String(interval));
          setSettingsInterval(0);
        }
        const ret = snapRes.data.retention_days || 90;
        const matched = RETENTION_OPTIONS.find((o) => o.days === ret);
        if (matched) {
          setRetentionDays(ret);
          setIsCustomRetention(false);
          setCustomRetention("");
        } else {
          setIsCustomRetention(true);
          setCustomRetention(String(ret));
          setRetentionDays(0);
        }
      }
      if (inactRes.data) {
        setIdleThreshold(inactRes.data.idle_threshold_minutes || 3);
        setLongIntervalThreshold(inactRes.data.long_interval_threshold_minutes || 10);
      }
    } catch {}
  };

  const saveAllSettings = async () => {
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
    if (idleThreshold < 1 || longIntervalThreshold < 1) {
      Swal.fire("Invalid", "Thresholds must be at least 1 minute.", "warning");
      setSettingsSaving(false);
      return;
    }
    try {
      await Promise.all([
        apiClient.patch(`${API}/snapshot-settings/`, { interval_minutes: interval, retention_days: retention }),
        apiClient.patch(`${API}/inactivity-settings/`, { idle_threshold_minutes: idleThreshold, long_interval_threshold_minutes: longIntervalThreshold }),
      ]);
      Swal.fire({ icon: "success", title: "Settings saved", timer: 1500, showConfirmButton: false });
      setShowSettings(false);
    } catch {
      Swal.fire("Error", "Could not save settings.", "error");
    } finally {
      setSettingsSaving(false);
    }
  };

  // ------------------------------------------------ per-user: activity log
  const openUserActivityLog = async (a: Account) => {
    setSelectedAccount(a);
    setShowActivityLog(true);
    setActivityLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    setActivityDate(today);
    try {
      const r = await apiClient.get(`${API}/activity/?account=${a.id}&date=${today}`);
      setActivityEntries(r.data.results || r.data);
    } catch { setActivityEntries([]); }
    finally { setActivityLoading(false); }
  };

  const loadActivityForDate = async (date: string) => {
    if (!selectedAccount) return;
    setActivityDate(date);
    setActivityLoading(true);
    try {
      const r = await apiClient.get(`${API}/activity/?account=${selectedAccount.id}&date=${date}`);
      setActivityEntries(r.data.results || r.data);
    } catch { setActivityEntries([]); }
    finally { setActivityLoading(false); }
  };

  // ------------------------------------------------ per-user: revoke access
  const revokeUserAccess = async (a: Account) => {
    const userDevices = devices.filter((d) => d.account_id === a.id && d.is_active);
    const ok = await Swal.fire({
      title: `Revoke access for ${a.name}?`,
      text: `This will sign out ${userDevices.length} active computer(s) and disable the account. They must be re-enabled to sign in again.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Revoke Access",
      confirmButtonColor: "#ef4444",
    });
    if (!ok.isConfirmed) return;
    try {
      for (const d of userDevices) {
        await apiClient.post(`${API}/devices/${d.id}/revoke/`);
      }
      await apiClient.patch(`${API}/accounts/${a.id}/`, { is_active: false });
      load();
    } catch (err: any) {
      Swal.fire("Failed", errorText(err, "Please try again."), "error");
    }
  };

  // ------------------------------------------------ activity timeline
  const timeline = useMemo<TimelineRow[]>(() => {
    if (activityEntries.length === 0) return [];
    const sorted = [...activityEntries].reverse(); // chronological
    const rows: TimelineRow[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i];

      if (i > 0) {
        const prevEnd = new Date(sorted[i - 1].ended_at || sorted[i - 1].started_at).getTime();
        const thisStart = new Date(entry.started_at).getTime();
        const gapSec = Math.max(0, (thisStart - prevEnd) / 1000);
        const gapMin = gapSec / 60;

        if (gapMin >= longIntervalThreshold) {
          rows.push({ type: "long_interval", label: "Long Interval", time: new Date(prevEnd).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), duration_seconds: Math.round(gapSec) });
        } else if (gapMin >= idleThreshold) {
          rows.push({ type: "idle", label: "Idle", time: new Date(prevEnd).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), duration_seconds: Math.round(gapSec) });
        }
      }

      rows.push({
        type: "active",
        label: entry.app_name || entry.title || "Unknown",
        time: new Date(entry.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        duration_seconds: entry.duration_seconds,
        url: entry.url,
      });
    }
    return rows;
  }, [activityEntries, idleThreshold, longIntervalThreshold]);

  const activitySummary = useMemo(() => {
    if (activityEntries.length === 0) return null;
    let activeSec = 0;
    let idleSec = 0;
    let longSec = 0;

    const sorted = [...activityEntries].reverse();
    for (let i = 0; i < sorted.length; i++) {
      activeSec += sorted[i].duration_seconds;
      if (i > 0) {
        const prevEnd = new Date(sorted[i - 1].ended_at || sorted[i - 1].started_at).getTime();
        const thisStart = new Date(sorted[i].started_at).getTime();
        const gapSec = Math.max(0, (thisStart - prevEnd) / 1000);
        const gapMin = gapSec / 60;
        if (gapMin >= longIntervalThreshold) longSec += gapSec;
        else if (gapMin >= idleThreshold) idleSec += gapSec;
      }
    }

    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const totalSec = Math.max(0, (new Date(last.ended_at || last.started_at).getTime() - new Date(first.started_at).getTime()) / 1000);
    const offlineSec = Math.max(0, totalSec - activeSec - idleSec - longSec);

    return { activeSec, idleSec, longSec, offlineSec };
  }, [activityEntries, idleThreshold, longIntervalThreshold]);

  // ------------------------------------------------------- download / sessions log
  const downloadApp = async () => {
    try {
      const r = await apiClient.get(`${API}/agent/download/`, { responseType: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(r.data);
      a.download = INSTALLER_NAME;
      a.click();
      URL.revokeObjectURL(a.href);
      Swal.fire({
        icon: "info",
        title: "Installation Instructions",
        html: `<ol style="text-align:left;margin:0;padding-left:1.2rem;line-height:1.8">
          <li>If the old app is running, <b>close it first</b> — right-click the tray icon → Quit, or end the task from Task Manager.</li>
          <li>Run the downloaded <b>${INSTALLER_NAME}</b> file.</li>
          <li>Sign in with User ID, Password, and Passkey.</li>
          <li>The app will run in the background automatically.</li>
        </ol>`,
        confirmButtonText: "Got it",
      });
    } catch (err: any) {
      if (err?.response?.status === 404) {
        Swal.fire("Not available yet", "The ZuperHR Monitor installer hasn't been published yet.", "info");
      } else {
        Swal.fire("Download failed", "Please try again.", "error");
      }
    }
  };

  const openSessionsLog = async () => {
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

  const snapshotDevicesForModal = selectedAccount
    ? devices.filter((d) => d.account_id === selectedAccount.id && d.is_active)
    : devices.filter((d) => d.is_active);

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
                <tr><th>User ID</th><th>Name</th><th>Status</th><th>Computers</th><th>Last sign-in</th><th className="text-end">Actions</th></tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-4"><Spinner animation="border" size="sm" /> Loading…</td></tr>
                ) : accounts.length === 0 ? (
                  <tr><td colSpan={6} className="text-center text-muted py-4">
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
                      {!a.is_active ? (
                        <Badge bg="secondary">Disabled</Badge>
                      ) : a.online_count > 0 ? (
                        <Badge bg="success">Online</Badge>
                      ) : (
                        <Badge bg="secondary-subtle" text="secondary">Offline</Badge>
                      )}
                      {a.is_locked && <Badge bg="warning" text="dark" className="ms-1" title="Too many wrong attempts; unlocks after 15 minutes, or reset credentials.">Locked</Badge>}
                    </td>
                    <td>
                      {a.device_count}
                      {a.online_count > 0 && <span className="text-success small ms-2">● {a.online_count} online</span>}
                    </td>
                    <td className="text-muted small">{fmt(a.last_signin_at)}</td>
                    <td className="text-end text-nowrap">
                      <Button size="sm" variant="outline-primary" className="me-1" disabled={a.online_count === 0} onClick={() => watchUserLive(a)} title="Watch Live">
                        <IconEye size={16} />
                      </Button>
                      <Button size="sm" variant="outline-primary" className="me-1" onClick={() => openUserSnapshots(a)} title="Snapshots">
                        <IconCamera size={16} />
                      </Button>
                      <Button size="sm" variant="outline-secondary" className="me-1" onClick={() => openUserSettings(a)} title="Settings">
                        <IconSettings size={16} />
                      </Button>
                      <Button size="sm" variant="outline-secondary" className="me-1" onClick={() => openUserActivityLog(a)} title="Activity Log">
                        <IconHistory size={16} />
                      </Button>
                      <Button size="sm" variant="outline-danger" onClick={() => revokeUserAccess(a)} title="Revoke Access">
                        <IconLogout size={16} />
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
                      <Button size="sm" variant="primary" className="me-1" disabled={!d.is_online} onClick={() => startWatching(d)} title="Watch Live">
                        <IconEye size={16} />
                      </Button>
                      <Button size="sm" variant="outline-primary" className="me-1" onClick={() => openSnapshots(d.id)} title="Snapshots">
                        <IconCamera size={16} />
                      </Button>
                      <Button size="sm" variant="outline-danger" onClick={() => revokeDevice(d)} title="Revoke Access">
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
        <Modal.Header>
          <Modal.Title className="fs-6 me-auto">
            {watching?.account_name} ({watching?.account_user_id}) — {watching?.device_name}
            <span className="ms-3 small fw-normal text-success">{watchStatus}</span>
          </Modal.Title>
          <Button variant="outline-primary" size="sm" className="me-2" onClick={() => { setMessageText(""); setShowComposer(true); }}>
            <IconMessage size={16} className="me-1" />Send Message
          </Button>
          <button type="button" className="btn-close" aria-label="Close" onClick={stopWatching}></button>
        </Modal.Header>
        <Modal.Body className="bg-dark p-2">
          <video ref={videoRef} autoPlay playsInline style={{ width: "100%", borderRadius: 8, background: "#000" }} />
          {Object.keys(messageStatuses).length > 0 && (
            <div className="mt-2 d-flex flex-wrap gap-2">
              {Object.entries(messageStatuses).map(([id, st]) => (
                <Badge key={id} bg={st === "ACKNOWLEDGED" ? "success" : st === "FAILED" ? "danger" : "warning"} text={st === "ACKNOWLEDGED" ? "light" : "dark"} className="small">
                  Message: {st === "ACKNOWLEDGED" ? "Acknowledged ✓" : st === "SENT" ? "Sent" : st === "DELIVERED" ? "Delivered" : st === "FAILED" ? "Failed" : st}
                </Badge>
              ))}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer className="py-2">
          <span className="text-muted small me-auto">This view is being recorded.</span>
          <Button variant="secondary" onClick={stopWatching}>Stop watching</Button>
        </Modal.Footer>
      </Modal>

      {/* Send Message Composer */}
      <Modal show={showComposer} onHide={() => setShowComposer(false)} centered backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title className="fs-6">Send Message to Employee</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="mb-3">
            <Form.Label className="small fw-medium">Employee</Form.Label>
            <div className="fw-semibold">{watching?.account_name} <span className="text-muted font-monospace">({watching?.account_user_id})</span></div>
          </div>
          <Form.Group>
            <Form.Label className="small fw-medium">Message</Form.Label>
            <Form.Control
              as="textarea"
              rows={4}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Type your message to the employee…"
              maxLength={1000}
              autoFocus
            />
            <Form.Text className="text-muted">{messageText.length}/1000 characters</Form.Text>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="light" onClick={() => setShowComposer(false)} disabled={sendingMessage}>Cancel</Button>
          <Button variant="primary" onClick={sendMessage} disabled={sendingMessage || !messageText.trim()}>
            {sendingMessage ? <><Spinner animation="border" size="sm" className="me-1" />Sending…</> : "Send"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Snapshots modal */}
      <Modal show={showSnapshots} onHide={() => { setShowSnapshots(false); setPreviewImage(null); setSelectedAccount(null); }} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title className="fs-6">
            Snapshots{selectedAccount ? ` — ${selectedAccount.name} (${selectedAccount.user_id})` : ""}
          </Modal.Title>
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
              {snapshotDevicesForModal.map((d) => (
                <option key={d.id} value={d.id}>{d.account_name} — {d.device_name}</option>
              ))}
            </Form.Select>
          </div>

          {previewImage ? (
            <div className="text-center">
              <Button variant="link" size="sm" className="mb-2" onClick={() => setPreviewImage(null)}>← Back to list</Button>
              <img src={previewImage} alt="Snapshot" style={{ width: "100%", borderRadius: 8, border: "1px solid #dee2e6" }} />
            </div>
          ) : snapshotsLoading ? (
            <div className="text-center py-4"><Spinner animation="border" size="sm" /> Loading…</div>
          ) : snapshots.length === 0 ? (
            <div className="text-center text-muted py-4">No snapshots captured yet.</div>
          ) : (
            <div className="row g-2">
              {snapshots.map((snap) => (
                <div key={snap.id} className="col-6 col-md-4">
                  <div className="border rounded overflow-hidden" style={{ cursor: "pointer" }} onClick={() => setPreviewImage(snap.image)}>
                    <img src={snap.image} alt={`${snap.account_name} snapshot`} style={{ width: "100%", height: 140, objectFit: "cover" }} />
                    <div className="p-2 small">
                      <div className="fw-medium">{snap.account_name}</div>
                      <div className="text-muted">{fmt(snap.captured_at)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal.Body>
      </Modal>

      {/* Settings modal (per-user) */}
      <Modal show={showSettings} onHide={() => { setShowSettings(false); setSelectedAccount(null); }} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title className="fs-6">
            Settings{selectedAccount ? ` — ${selectedAccount.name} (${selectedAccount.user_id})` : ""}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {/* Snapshot settings */}
          <h6 className="fw-semibold mb-2"><IconCamera size={16} className="me-1" />Snapshot Settings</h6>
          <p className="text-muted small mb-2">How often automatic screenshots are captured. Default is 30 minutes.</p>

          <Form.Label className="small fw-medium mb-1">Snapshot interval</Form.Label>
          <div className="d-flex flex-wrap gap-2 mb-3">
            {INTERVAL_OPTIONS.map((m) => (
              <Button key={m} size="sm" variant={!isCustom && settingsInterval === m ? "primary" : "outline-secondary"}
                onClick={() => { setSettingsInterval(m); setIsCustom(false); setCustomInterval(""); }}>
                {m < 60 ? `${m} min` : `${m / 60} hour`}
              </Button>
            ))}
            <Button size="sm" variant={isCustom ? "primary" : "outline-secondary"}
              onClick={() => { setIsCustom(true); setSettingsInterval(0); }}>Custom</Button>
          </div>
          {isCustom && (
            <div className="mb-3">
              <Form.Control type="number" min={1} placeholder="e.g. 45" value={customInterval}
                onChange={(e) => setCustomInterval(e.target.value)} style={{ maxWidth: 200 }} />
            </div>
          )}

          <Form.Label className="small fw-medium mb-1">Auto-delete snapshots after</Form.Label>
          <div className="d-flex flex-wrap gap-2 mb-3">
            {RETENTION_OPTIONS.map((opt) => (
              <Button key={opt.days} size="sm" variant={!isCustomRetention && retentionDays === opt.days ? "primary" : "outline-secondary"}
                onClick={() => { setRetentionDays(opt.days); setIsCustomRetention(false); setCustomRetention(""); }}>
                {opt.label}
              </Button>
            ))}
            <Button size="sm" variant={isCustomRetention ? "primary" : "outline-secondary"}
              onClick={() => { setIsCustomRetention(true); setRetentionDays(0); }}>Custom</Button>
          </div>
          {isCustomRetention && (
            <div className="mb-3">
              <Form.Control type="number" min={1} placeholder="e.g. 6 (months)" value={customRetention}
                onChange={(e) => setCustomRetention(e.target.value)} style={{ maxWidth: 200 }} />
            </div>
          )}

          <hr />

          {/* Inactivity module */}
          <h6 className="fw-semibold mb-2"><IconHistory size={16} className="me-1" />Inactivity Module</h6>
          <p className="text-muted small mb-2">
            Configure when a user is considered Idle or on a Long Interval based on gaps in their activity.
          </p>
          <div className="row g-3 mb-3">
            <div className="col-6">
              <Form.Label className="small fw-medium">Idle threshold (minutes)</Form.Label>
              <Form.Control type="number" min={1} value={idleThreshold}
                onChange={(e) => setIdleThreshold(parseInt(e.target.value, 10) || 1)} style={{ maxWidth: 150 }} />
              <Form.Text className="text-muted">Inactivity above this = Idle</Form.Text>
            </div>
            <div className="col-6">
              <Form.Label className="small fw-medium">Long interval threshold (minutes)</Form.Label>
              <Form.Control type="number" min={1} value={longIntervalThreshold}
                onChange={(e) => setLongIntervalThreshold(parseInt(e.target.value, 10) || 1)} style={{ maxWidth: 150 }} />
              <Form.Text className="text-muted">Inactivity above this = Long Interval</Form.Text>
            </div>
          </div>

          <hr />

          {/* Uninstall protection */}
          <h6 className="fw-semibold mb-2"><IconLock size={16} className="me-1" />Uninstall Protection</h6>
          <p className="text-muted small mb-2">
            When set, employees must enter this password to quit or uninstall the monitoring app from their computer.
          </p>
          <div className="d-flex align-items-center gap-2 mb-2">
            <Badge bg={uninstallPasswordSet ? "success" : "secondary"}>
              {uninstallPasswordSet ? "Password is set" : "Not set"}
            </Badge>
          </div>
          <div className="d-flex gap-2 mb-3">
            <Form.Control
              type="password"
              size="sm"
              placeholder={uninstallPasswordSet ? "Enter new password to change" : "Set a password (min 4 chars)"}
              value={newUninstallPassword}
              onChange={(e) => setNewUninstallPassword(e.target.value)}
              style={{ maxWidth: 250 }}
            />
            <Button
              size="sm"
              variant="primary"
              disabled={savingUninstallPassword || newUninstallPassword.trim().length < 4}
              onClick={async () => {
                setSavingUninstallPassword(true);
                try {
                  await apiClient.post(`${API}/uninstall-password/`, { password: newUninstallPassword.trim() });
                  setUninstallPasswordSet(true);
                  setNewUninstallPassword("");
                  Swal.fire({ icon: "success", title: "Uninstall password set", timer: 1500, showConfirmButton: false });
                } catch (err: any) {
                  Swal.fire("Error", errorText(err, "Could not set password."), "error");
                } finally {
                  setSavingUninstallPassword(false);
                }
              }}
            >
              {savingUninstallPassword ? <Spinner animation="border" size="sm" /> : <><IconLock size={14} className="me-1" />Set</>}
            </Button>
            {uninstallPasswordSet && (
              <Button
                size="sm"
                variant="outline-danger"
                onClick={async () => {
                  const ok = await Swal.fire({
                    title: "Remove uninstall protection?",
                    text: "Employees will be able to quit or uninstall the app without a password.",
                    icon: "warning",
                    showCancelButton: true,
                    confirmButtonText: "Remove",
                    confirmButtonColor: "#ef4444",
                  });
                  if (!ok.isConfirmed) return;
                  try {
                    await apiClient.delete(`${API}/uninstall-password/`);
                    setUninstallPasswordSet(false);
                    setNewUninstallPassword("");
                  } catch (err: any) {
                    Swal.fire("Error", errorText(err, "Could not remove password."), "error");
                  }
                }}
              >
                <IconLockOpen size={14} className="me-1" />Remove
              </Button>
            )}
          </div>

          <hr />

          {/* User management */}
          {selectedAccount && (
            <>
              <h6 className="fw-semibold mb-3">Manage User</h6>
              <div className="d-flex flex-wrap gap-2 mb-3">
                <Button size="sm" variant="outline-primary" onClick={() => { setShowSettings(false); resetCredentials(selectedAccount); }}>
                  <IconKey size={16} className="me-1" />Reset Credentials
                </Button>
                <Button size="sm" variant={selectedAccount.is_active ? "outline-secondary" : "outline-success"}
                  onClick={() => { setShowSettings(false); toggleActive(selectedAccount); }}>
                  {selectedAccount.is_active ? <><IconUserOff size={16} className="me-1" />Disable User</> : <><IconUserCheck size={16} className="me-1" />Enable User</>}
                </Button>
              </div>
              <div className="p-3 rounded" style={{ background: "#fff5f5", border: "1px solid #fecaca" }}>
                <div className="d-flex align-items-center justify-content-between">
                  <div>
                    <div className="fw-medium text-danger small">Permanently Delete User</div>
                    <div className="text-muted small">This will remove the account and all its data. This cannot be undone.</div>
                  </div>
                  <Button size="sm" variant="danger" onClick={() => deleteAccount(selectedAccount)}>
                    <IconTrash size={16} className="me-1" />Delete
                  </Button>
                </div>
              </div>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => { setShowSettings(false); setSelectedAccount(null); }}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={saveAllSettings} disabled={settingsSaving}>
            {settingsSaving ? <Spinner animation="border" size="sm" /> : "Save Settings"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Activity Log modal (per-user) */}
      <Modal show={showActivityLog} onHide={() => { setShowActivityLog(false); setSelectedAccount(null); }} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title className="fs-6">
            Activity Log{selectedAccount ? ` — ${selectedAccount.name} (${selectedAccount.user_id})` : ""}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-flex align-items-center gap-3 mb-3">
            <Form.Label className="mb-0 small fw-medium text-nowrap">Date:</Form.Label>
            <Form.Control
              type="date"
              size="sm"
              value={activityDate}
              onChange={(e) => loadActivityForDate(e.target.value)}
              style={{ maxWidth: 200 }}
            />
          </div>

          {activityLoading ? (
            <div className="text-center py-4"><Spinner animation="border" size="sm" /> Loading…</div>
          ) : timeline.length === 0 ? (
            <div className="text-center text-muted py-4">No activity recorded for this date.</div>
          ) : (
            <>
              <Table responsive size="sm" hover className="mb-0">
                <thead className="table-light">
                  <tr><th style={{ width: 80 }}>Time</th><th>Application / Website</th><th style={{ width: 100 }}>Duration</th><th style={{ width: 110 }}>Status</th></tr>
                </thead>
                <tbody>
                  {timeline.map((row, i) => (
                    <tr key={i} className={row.type === "long_interval" ? "table-warning" : row.type === "idle" ? "table-light" : ""}>
                      <td className="small text-muted">{row.time}</td>
                      <td className="small">
                        {row.type === "active" ? (
                          <>
                            <span className="fw-medium">{row.label}</span>
                            {row.url && <div className="text-muted text-truncate" style={{ maxWidth: 400 }}>{row.url}</div>}
                          </>
                        ) : (
                          <span className="fst-italic text-muted">—</span>
                        )}
                      </td>
                      <td className="small">{fmtHM(row.duration_seconds)}</td>
                      <td>
                        {row.type === "active" && <Badge bg="success-subtle" text="success">Active</Badge>}
                        {row.type === "idle" && <Badge bg="warning-subtle" text="warning">Idle</Badge>}
                        {row.type === "long_interval" && <Badge bg="danger-subtle" text="danger">Long Interval</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              {activitySummary && (
                <div className="d-flex flex-wrap gap-3 mt-3 p-3 rounded" style={{ background: "#f8f9fa" }}>
                  <div className="text-center">
                    <div className="fw-semibold text-success">{fmtHM(activitySummary.activeSec)}</div>
                    <div className="text-muted small">Active Hours</div>
                  </div>
                  <div className="text-center">
                    <div className="fw-semibold text-warning">{fmtHM(activitySummary.idleSec)}</div>
                    <div className="text-muted small">Total Idle</div>
                  </div>
                  <div className="text-center">
                    <div className="fw-semibold text-danger">{fmtHM(activitySummary.longSec)}</div>
                    <div className="text-muted small">Long Interval</div>
                  </div>
                  <div className="text-center">
                    <div className="fw-semibold text-secondary">{fmtHM(activitySummary.offlineSec)}</div>
                    <div className="text-muted small">Total Offline</div>
                  </div>
                </div>
              )}
            </>
          )}
        </Modal.Body>
      </Modal>

      {/* Sessions log (who watched whom) */}
      <Modal show={showLog} onHide={() => setShowLog(false)} size="lg" centered>
        <Modal.Header closeButton><Modal.Title className="fs-6">Monitoring sessions log</Modal.Title></Modal.Header>
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
