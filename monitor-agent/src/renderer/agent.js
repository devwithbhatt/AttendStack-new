"use strict";

/**
 * Renderer logic for the ZuperHR Monitor agent (Company Admin Monitoring).
 *
 * Flow:
 *  - On boot, ask main for { server, token }.
 *  - If a token exists, connect to the signalling WebSocket immediately.
 *  - If not, show the sign-in form (Organisation ID + email + password).
 *
 * Screen capture uses getDisplayMedia(), which the MAIN process grants silently
 * (primary screen, no picker). The agent only ever SENDS a video track.
 */

let SERVER = "http://localhost:8001";
let WS_BASE = "ws://localhost:8001";
let deviceToken = null;

let ws = null, pc = null, localStream = null, heartbeat = null, iceServers = [], reconnectDelay = 1000;
const deliveredMessageIds = new Set();
let pendingPollTimer = null;

const $ = (id) => document.getElementById(id);

function deriveWs(server) {
  try {
    const u = new URL(server);
    const proto = u.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${u.host}`;
  } catch { return "ws://localhost:8001"; }
}

function showActive(who) {
  $("loginCard").classList.add("hidden");
  $("activeCard").classList.remove("hidden");
  if (who) $("who").textContent = who;
}
function setStatus(text, live) {
  $("statusline").textContent = text;
  $("statusline").className = "statusline" + (live ? " live" : "");
}

// ------------------------------------------------------------------- boot
(async function boot() {
  const state = await window.agentAPI.getBootState();
  SERVER = state.server || SERVER;
  WS_BASE = deriveWs(SERVER);
  if (state.token && state.token.device_token) {
    deviceToken = state.token.device_token;
    showActive(state.token.who);
    connect();
  }
})();

// --------------------------------------------------------------- sign in
$("signinBtn").onclick = async () => {
  $("loginErr").textContent = "";
  const btn = $("signinBtn"); btn.disabled = true; btn.textContent = "Signing in…";
  const body = {
    organization_id: $("orgId").value.trim(),
    email: $("email").value.trim(),
    password: $("password").value,
    device_fingerprint: await fingerprint(),
    device_name: (navigator.platform || "PC"),
    platform: "windows",
    consent_acknowledged: $("consent").checked,
  };
  try {
    const r = await window.agentAPI.register(body);
    const data = r.data || {};
    if (!r.ok) {
      $("loginErr").textContent = data.detail || data.consent_acknowledged || Object.values(data)[0] || "Sign in failed.";
      btn.disabled = false; btn.textContent = "Sign in"; return;
    }
    deviceToken = data.device_token;
    await window.agentAPI.onRegistered({
      device_id: data.device_id,
      device_token: data.device_token,
      who: data.employee_name || body.email,
    });
    showActive(data.employee_name || body.email);
    connect();
  } catch (e) {
    $("loginErr").textContent = "Network error: " + e.message;
    btn.disabled = false; btn.textContent = "Sign in";
  }
};

async function fingerprint() {
  let fp = localStorage.getItem("zhr_fp");
  if (!fp) { fp = "win-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random()); localStorage.setItem("zhr_fp", fp); }
  return fp;
}

// ----------------------------------------------------- pending messages (HTTP fallback)
async function fetchPendingMessages() {
  if (!deviceToken) return;
  try {
    const res = await fetch(SERVER + "/api/v1/monitoring/agent/messages/pending/", {
      headers: { Authorization: "Device " + deviceToken },
    });
    if (!res.ok) return;
    const messages = await res.json();
    for (const msg of messages) {
      if (deliveredMessageIds.has(msg.id)) continue;
      deliveredMessageIds.add(msg.id);
      window.agentAPI.showAdminMessage({
        message_id: msg.id,
        sender_name: msg.sender_name,
        content: msg.content,
        created_at: msg.created_at,
      });
    }
  } catch (_) {}
}

function startPendingPoll() {
  stopPendingPoll();
  fetchPendingMessages();
  pendingPollTimer = setInterval(fetchPendingMessages, 30000);
}

function stopPendingPoll() {
  if (pendingPollTimer) { clearInterval(pendingPollTimer); pendingPollTimer = null; }
}

// ----------------------------------------------------- signalling (always on)
function connect() {
  if (!deviceToken) return;
  setStatus("Connecting…", false);
  ws = new WebSocket(WS_BASE + "/ws/monitor/agent/?device_token=" + encodeURIComponent(deviceToken));
  ws.onopen = () => {
    reconnectDelay = 1000;
    setStatus("● Online — monitoring active", true);
    heartbeat = setInterval(() => { try { ws.send(JSON.stringify({ action: "heartbeat", active: true })); } catch (_) {} }, 20000);
  };
  ws.onmessage = async (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "ready") { iceServers = msg.ice_servers || []; startPendingPoll(); }
    else if (msg.type === "viewer_joined") { setStatus("● Admin is viewing", true); await startStream(msg.session); }
    else if (msg.type === "viewer_left") { setStatus("● Online — monitoring active", true); stopStream(); }
    else if (msg.type === "answer" && pc) await pc.setRemoteDescription(msg.payload);
    else if (msg.type === "ice" && pc && msg.payload) { try { await pc.addIceCandidate(msg.payload); } catch (_) {} }
    else if (msg.type === "admin_message" && msg.message_id && !deliveredMessageIds.has(msg.message_id)) {
      deliveredMessageIds.add(msg.message_id);
      window.agentAPI.showAdminMessage({
        message_id: msg.message_id,
        sender_name: msg.sender_name,
        content: msg.content,
        created_at: msg.created_at,
      });
    }
  };
  ws.onclose = () => {
    clearInterval(heartbeat); stopStream(); stopPendingPoll();
    if (deviceToken) {
      setStatus("Reconnecting…", false);
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 15000);
    }
  };
}

async function startStream(session) {
  try {
    localStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 10 }, audio: false });
  } catch (e) { setStatus("Capture error: " + e.message, false); return; }

  pc = new RTCPeerConnection({ iceServers });
  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
  pc.onicecandidate = (e) => { if (e.candidate && ws) ws.send(JSON.stringify({ action: "ice", session, payload: e.candidate.toJSON() })); };
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ action: "offer", session, payload: { type: offer.type, sdp: offer.sdp } }));
}

function stopStream() {
  if (pc) { try { pc.close(); } catch (_) {} pc = null; }
  if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
}
