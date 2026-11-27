import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Api, AppState, Settings } from '@shared/types'

const api: Api = {
  getState: () => ipcRenderer.invoke('state:get'),
  getModes: () => ipcRenderer.invoke('modes:get'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s: Settings) => ipcRenderer.invoke('settings:save', s),
  listModels: (s: Settings) => ipcRenderer.invoke('llm:models', s),
  testLLM: (s: Settings) => ipcRenderer.invoke('llm:test', s),
  setMode: (mode) => ipcRenderer.invoke('mode:set', mode),
  addTab: (mode) => ipcRenderer.invoke('tab:add', mode),
  selectTab: (id) => ipcRenderer.invoke('tab:select', id),
  closeTab: (id) => ipcRenderer.invoke('tab:close', id),
  editDiagram: (edit) => ipcRenderer.invoke('diagram:edit', edit),
  redraw: () => ipcRenderer.invoke('redraw'),
  reset: () => ipcRenderer.invoke('reset'),
  note: (text) => ipcRenderer.invoke('note', text),
  setPaused: (paused) => ipcRenderer.invoke('paused:set', paused),
  renderError: (error) => ipcRenderer.invoke('render:error', error),
  toggleOverlay: () => ipcRenderer.invoke('overlay:toggle'),
  openModesFolder: () => ipcRenderer.invoke('modes:open-folder'),
  startShare: () => ipcRenderer.invoke('share:start'),
  stopShare: () => ipcRenderer.invoke('share:stop'),
  joinSession: (link) => ipcRenderer.invoke('session:join', link),
  onState: (cb) => {
    const listener = (_: IpcRendererEvent, s: AppState) => cb(s)
    ipcRenderer.on('state', listener)
    return () => ipcRenderer.removeListener('state', listener)
  },
  isOverlay: process.argv.includes('--overlay'),
}

contextBridge.exposeInMainWorld('api', api)
