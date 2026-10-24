"use strict";

// Minimal, locked-down bridge between the renderer and the main process.
// The renderer can read boot state (server URL + stored token), report a
// successful registration, and forget the device. Nothing else is exposed.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agentAPI", {
  getBootState: () => ipcRenderer.invoke("agent:getBootState"),
  register: (payload) => ipcRenderer.invoke("agent:register", payload),
  onRegistered: (data) => ipcRenderer.invoke("agent:onRegistered", data),
  forget: () => ipcRenderer.invoke("agent:forget"),
  showAdminMessage: (msg) => ipcRenderer.invoke("agent:showAdminMessage", msg),
});

contextBridge.exposeInMainWorld("zuperhrAgent", {
  sendPasswordResult: (pw) => ipcRenderer.invoke("agent:passwordResult", pw),
});
