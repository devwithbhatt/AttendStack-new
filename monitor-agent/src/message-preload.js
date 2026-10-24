"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("messageAPI", {
  onDisplayMessage: (cb) => ipcRenderer.on("display-message", (_e, msg) => cb(msg)),
  acknowledge: (messageId) => ipcRenderer.invoke("agent:acknowledgeMessage", messageId),
});
