import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { AppSettings, PrintOptions, PrinterInfo } from '../main/core/types';

const api = {
  init: () => ipcRenderer.invoke('app:init'),
  listPrinters: (): Promise<{ ok: boolean; printers: PrinterInfo[]; error?: string }> =>
    ipcRenderer.invoke('printers:list'),
  start: (options: PrintOptions, flags: { skipOfficeWhenNoConverter?: boolean }) =>
    ipcRenderer.invoke('queue:start', options, flags),
  cancel: () => ipcRenderer.invoke('queue:cancel'),
  retry: () => ipcRenderer.invoke('queue:retry'),
  clearFinished: () => ipcRenderer.invoke('queue:clear-finished'),
  removeFile: (id: string) => ipcRenderer.invoke('files:remove', id),
  addFiles: (paths: string[]) => ipcRenderer.invoke('files:add', paths),
  showItem: (p: string) => ipcRenderer.invoke('shell:show-item', p),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open', url),
  integrationStatus: () => ipcRenderer.invoke('integration:status'),
  installIntegration: () => ipcRenderer.invoke('integration:install'),
  uninstallIntegration: () => ipcRenderer.invoke('integration:uninstall'),
  saveSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke('settings:save', patch),
  pickSoffice: () => ipcRenderer.invoke('settings:pick-soffice'),
  envStatus: () => ipcRenderer.invoke('env:status'),
  downloadSumatra: () => ipcRenderer.invoke('sumatra:download'),
  closeWindow: () => ipcRenderer.invoke('win:close'),
  onQueueUpdate: (cb: (data: unknown) => void) => {
    ipcRenderer.on('queue:update', (_e, data) => cb(data));
  },
  onSumatraProgress: (cb: (data: unknown) => void) => {
    ipcRenderer.on('sumatra:progress', (_e, data) => cb(data));
  },
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
};

contextBridge.exposeInMainWorld('api', api);
