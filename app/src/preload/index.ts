import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Api, AppState, Settings } from '@shared/types'

const api: Api = {
  getState: () => ipcRenderer.invoke('state:get'),
  getModes: () => ipcRenderer.invoke('modes:get'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s: Settings) => ipcRenderer.invoke('settings:save', s),
  setMode: (mode) => ipcRenderer.invoke('mode:set', mode),
  redraw: () => ipcRenderer.invoke('redraw'),
  reset: () => ipcRenderer.invoke('reset'),
  note: (text) => ipcRenderer.invoke('note', text),
  setPaused: (paused) => ipcRenderer.invoke('paused:set', paused),
  renderError: (error) => ipcRenderer.invoke('render:error', error),
  toggleOverlay: () => ipcRenderer.invoke('overlay:toggle'),
  openModesFolder: () => ipcRenderer.invoke('modes:open-folder'),
  onState: (cb) => {
    const listener = (_: IpcRendererEvent, s: AppState) => cb(s)
    ipcRenderer.on('state', listener)
    return () => ipcRenderer.removeListener('state', listener)
  },
  isOverlay: process.argv.includes('--overlay'),
}

contextBridge.exposeInMainWorld('api', api)
