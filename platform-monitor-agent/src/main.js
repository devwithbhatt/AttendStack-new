"use strict";

/**
 * Bhatt Square Watch — Electron main process.
 *
 * The Super Admin's monitoring app. Separate from the Company Admin app in
 * ../monitor-agent (different app ID, data folder, server endpoints and
 * tokens), so both can be installed on one computer without interfering.
 *
 * Responsibilities:
 *  1. Run as a single, background instance.
 *  2. Store the device token securely (Electron safeStorage, encrypted at rest).
 *  3. Grant screen capture SILENTLY (no "choose what to share" picker) by
 *     answering getDisplayMedia with the primary screen via desktopCapturer.
 *  4. Show the sign-in window (User ID + password + passkey) only when not
 *     signed in; afterwards run hidden and start automatically with Windows.
 *
 * The app is deliberately powerless: it streams the screen and nothing else.
 * There is no input-injection, file-access or remote-control code anywhere.
 */

const { app, BrowserWindow, desktopCapturer, session, ipcMain, Tray, Menu, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");
const { safeStorage } = require("electron");
const { SERVER_BASE, SHOW_TRAY, AUTO_LAUNCH } = require("./config");

const APP_TITLE = "Bhatt Square Watch";

// --- Single instance: a second launch just exits (app already running). ---
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
let tray = null;
let messagePopup = null;
const messageQueue = [];
let processingMessage = false;

const TOKEN_FILE = () => path.join(app.getPath("userData"), "device.bin");

// ---------------------------------------------------------------- token store
function saveToken(data) {
  try {
    const json = JSON.stringify(data);
    const buf = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(json)
      : Buffer.from(json, "utf8");
    fs.writeFileSync(TOKEN_FILE(), buf);
    return true;
  } catch (e) {
    console.error("saveToken failed", e);
    return false;
  }
}

function loadToken() {
  try {
    if (!fs.existsSync(TOKEN_FILE())) return null;
    const buf = fs.readFileSync(TOKEN_FILE());
    const json = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : buf.toString("utf8");
    return JSON.parse(json);
  } catch (e) {
    console.error("loadToken failed", e);
    return null;
  }
}

function clearToken() {
  try { fs.existsSync(TOKEN_FILE()) && fs.unlinkSync(TOKEN_FILE()); } catch (_) {}
}

// ------------------------------------------------- silent screen-capture grant
function installDisplayMediaHandler() {
  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      desktopCapturer
        .getSources({ types: ["screen"] })
        .then((sources) => {
          const primary = sources[0];
          if (!primary) return callback({}); // no screen -> deny
          callback({ video: primary }); // audio intentionally omitted
        })
        .catch(() => callback({}));
    },
    { useSystemPicker: false }
  );
}

// ------------------------------------------------------------------- window
function showWindow() {
  if (!win) return;
  win.show();
  win.setSkipTaskbar(false);
}

function createWindow(showForSignIn) {
  win = new BrowserWindow({
    width: 460,
    height: 680,
    show: showForSignIn,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: !showForSignIn,
    title: APP_TITLE,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  // Closing the window never quits the app; it just hides again.
  win.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
      win.setSkipTaskbar(true);
    }
  });
}

function createTray() {
  if (!SHOW_TRAY) return;
  const img = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
  );
  tray = new Tray(img);
  tray.setToolTip(`${APP_TITLE} — active`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `${APP_TITLE} (active)`, enabled: false },
      { label: "Show status", click: showWindow },
      { type: "separator" },
      { label: "Quit", click: () => { app.isQuitting = true; app.quit(); } },
    ])
  );
}

// --------------------------------------------------------------------- IPC
ipcMain.handle("agent:getBootState", () => ({
  server: SERVER_BASE,
  token: loadToken(),              // null when not signed in
}));

// Sign-in runs in the MAIN process (Node fetch), so the cross-origin POST is
// not subject to browser CORS. The server checks all three credentials.
ipcMain.handle("agent:signIn", async (_e, payload) => {
  try {
    const res = await fetch(SERVER_BASE + "/api/v1/platform-monitoring/agent/sign-in/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { detail: "Cannot reach the server. Check the internet connection." } };
  }
});

ipcMain.handle("agent:onSignedIn", (_e, data) => {
  saveToken(data);                 // { device_id, device_token, who }
  if (AUTO_LAUNCH) {
    app.setLoginItemSettings({ openAtLogin: true, args: ["--hidden"] });
  }
  if (win) { win.hide(); win.setSkipTaskbar(true); }
  return true;
});

// The server refused this computer (signed out by the Super Admin, account
// disabled or deleted): forget the token and ask for credentials again.
ipcMain.handle("agent:signedOut", () => {
  clearToken();
  app.setLoginItemSettings({ openAtLogin: false });
  showWindow();
  return true;
});

// ------------------------------------------------------------ message popup
function showNextMessage() {
  if (processingMessage || messageQueue.length === 0) return;
  processingMessage = true;
  const msg = messageQueue[0];

  const { screen } = require("electron");
  const primary = screen.getPrimaryDisplay();
  const { width, height } = primary.workAreaSize;
  const popW = 480, popH = 340;

  messagePopup = new BrowserWindow({
    width: popW,
    height: popH,
    x: Math.round((width - popW) / 2),
    y: Math.round((height - popH) / 2),
    resizable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    frame: false,
    transparent: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, "message-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  messagePopup.setAlwaysOnTop(true, "screen-saver");
  messagePopup.loadFile(path.join(__dirname, "renderer", "message-popup.html"));
  messagePopup.webContents.on("did-finish-load", () => {
    messagePopup.webContents.send("display-message", msg);
  });
  messagePopup.on("closed", () => { messagePopup = null; });
  messagePopup.show();
  messagePopup.focus();
}

ipcMain.handle("agent:showAdminMessage", (_e, msg) => {
  messageQueue.push(msg);
  if (!processingMessage) showNextMessage();
  return true;
});

ipcMain.handle("agent:acknowledgeMessage", async (_e, messageId) => {
  const tokenData = loadToken();
  if (!tokenData || !tokenData.device_token) return { ok: false };
  try {
    const res = await fetch(
      SERVER_BASE + `/api/v1/platform-monitoring/agent/messages/${messageId}/acknowledge/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Device ${tokenData.device_token}`,
        },
      }
    );
    if (res.ok) {
      messageQueue.shift();
      processingMessage = false;
      if (messagePopup) { messagePopup.destroy(); messagePopup = null; }
      showNextMessage();
      return { ok: true };
    }
    return { ok: false, status: res.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// --------------------------------------------------------------------- boot
app.on("second-instance", showWindow);

app.whenReady().then(() => {
  installDisplayMediaHandler();

  const launchedHidden = process.argv.includes("--hidden");
  const hasToken = !!loadToken();

  createWindow(/* showForSignIn */ !hasToken && !launchedHidden);
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(!loadToken());
  });
});

// Keep running when all windows are closed (background app).
app.on("window-all-closed", () => { /* do not quit */ });
