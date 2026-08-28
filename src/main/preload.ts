import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectModelFile: () => ipcRenderer.invoke('select-model-file'),
  startServer: (modelPath: string, port?: number) => ipcRenderer.invoke('start-server', modelPath, port),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  onServerLog: (callback: (log: string) => void) => {
    const handler = (_: any, log: string) => callback(log);
    ipcRenderer.on('server-log', handler);
    return () => ipcRenderer.removeListener('server-log', handler);
  },
  onServerStatusChanged: (callback: (status: { running: boolean; code: number | null }) => void) => {
    const handler = (_: any, status: { running: boolean; code: number | null }) => callback(status);
    ipcRenderer.on('server-status-changed', handler);
    return () => ipcRenderer.removeListener('server-status-changed', handler);
  },
});
