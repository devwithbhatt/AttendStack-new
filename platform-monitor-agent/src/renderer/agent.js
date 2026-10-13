"use strict";

/**
 * Renderer logic for Bhatt Square Watch.
 *
 * Flow:
 *  - On boot, ask main for { server, token }.
 *  - Signed in already: connect to the signalling WebSocket and stay online
 *    (the window is hidden by main).
 *  - Not signed in: show the form. User ID, password and passkey are sent
 *    exactly as typed (only surrounding spaces are trimmed) and checked by the
 *    server. On success the token is stored via main and we connect.
 *  - If the server closes the socket with 4001 (computer signed out, account
 *    disabled or deleted), forget the token and show the form again.
 *
 * Screen capture uses getDisplayMedia(), which main grants silently (primary
 * screen, no picker). The app only ever SENDS video; it has no control path.
 */

const CLOSE_SIGNED_OUT = 4001;

let SERVER = "http://localhost:8001";
let WS_BASE = "ws://localhost:8001";
let deviceToken = null;

let ws = null, pc = null, localStream = null, heartbeat = null, iceServers = [], reconnectDelay = 1000;

const $ = (id) => document.getElementById(id);

function deriveWs(server) {
  try {
    const u = new URL(server);
    return `${u.protocol === "https:" ? "wss:" : "ws:"}//${u.host}`;
  } catch { return "ws://localhost:8001"; }
}

function showActive(who) {
  $("loginCard").classList.add("hidden");
  $("activeCard").classList.remove("hidden");
  if (who) $("who").textContent = who;
}
function showLogin(signedOut) {
  $("activeCard").classList.add("hidden");
  $("loginCard").classList.remove("hidden");
  $("signedOutNotice").classList.toggle("hidden", !signedOut);
  const btn = $("signinBtn"); btn.disabled = false; btn.textContent = "Sign in";
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
function firstError(data) {
  if (!data) return "Sign in failed.";
  if (typeof data.detail === "string") return data.detail;
  const v = Object.values(data)[0];
  return Array.isArray(v) ? v[0] : (typeof v === "string" ? v : "Sign in failed.");
}

$("signinBtn").onclick = async () => {
  $("loginErr").textContent = "";
  const userId = $("userId").value.trim();
  const password = $("password").value.trim();
  const passkey = $("passkey").value.trim();
  if (!userId || !password || !passkey) {
    $("loginErr").textContent = "Enter your User ID, password and passkey.";
    return;
  }
  if (!$("consent").checked) {
    $("loginErr").textContent = "Please tick the box to confirm you understand.";
    return;
  }
  const btn = $("signinBtn"); btn.disabled = true; btn.textContent = "Signing in…";
  const body = {
    user_id: userId,
    password,
    passkey,
    device_fingerprint: fingerprint(),
    device_name: (navigator.platform || "PC"),
    platform: "windows",
    consent_acknowledged: true,
  };
  const r = await window.agentAPI.signIn(body);
  const data = r.data || {};
  if (!r.ok) {
    $("loginErr").textContent = firstError(data);
    btn.disabled = false; btn.textContent = "Sign in";
    return;
  }
  deviceToken = data.device_token;
  const who = `${data.name} (${data.user_id})`;
  await window.agentAPI.onSignedIn({ device_id: data.device_id, device_token: data.device_token, who });
  $("password").value = ""; $("passkey").value = "";
  showActive(who);
  connect();
};

// A stable per-install fingerprint, kept in this app's own storage.
function fingerprint() {
  let fp = localStorage.getItem("aspmon_fp");
  if (!fp) {
    fp = "pwin-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random());
    localStorage.setItem("aspmon_fp", fp);
  }
  return fp;
}

// ----------------------------------------------------- signalling (always on)
function connect() {
  if (!deviceToken) return;
  setStatus("Connecting…", false);
  ws = new WebSocket(WS_BASE + "/ws/platform-monitor/agent/?device_token=" + encodeURIComponent(deviceToken));
  ws.onopen = () => {
    reconnectDelay = 1000;
    setStatus("● Online — monitoring active", true);
    heartbeat = setInterval(() => { try { ws.send(JSON.stringify({ action: "heartbeat", active: true })); } catch (_) {} }, 20000);
  };
  ws.onmessage = async (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "ready") iceServers = msg.ice_servers || [];
    else if (msg.type === "viewer_joined") { setStatus("● Administrator is viewing", true); await startStream(msg.session); }
    else if (msg.type === "viewer_left") { setStatus("● Online — monitoring active", true); stopStream(); }
    else if (msg.type === "answer" && pc) await pc.setRemoteDescription(msg.payload);
    else if (msg.type === "ice" && pc && msg.payload) { try { await pc.addIceCandidate(msg.payload); } catch (_) {} }
  };
  ws.onclose = async (ev) => {
    clearInterval(heartbeat); stopStream();
    if (ev.code === CLOSE_SIGNED_OUT) {
      deviceToken = null;
      await window.agentAPI.signedOut();
      showLogin(true);
      return;
    }
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
