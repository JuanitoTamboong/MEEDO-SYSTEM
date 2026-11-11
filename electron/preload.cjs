// preload.cjs
const { contextBridge } = require('electron');

// Safely expose specific functions to your React frontend
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isDesktop: true
});