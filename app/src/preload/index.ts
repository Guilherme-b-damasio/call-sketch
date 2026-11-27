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
  saveExport: (req) => ipcRenderer.invoke('export:save', req),
  redraw: () => ipcRenderer.invoke('redraw'),
  reset: () => ipcRenderer.invoke('reset'),
  note: (text) => ipcRenderer.invoke('note', text),
  setPaused: (paused) => ipcRenderer.invoke('paused:set', paused),
  renderError: (error) => ipcRenderer.invoke('render:error', error),
  toggleOverlay: () => ipcRenderer.invoke('overlay:toggle'),
  openModesFolder: () => ipcRenderer.invoke('modes:open-folder'),
  listCalls: () => ipcRenderer.invoke('history:list'),
  getCall: (id) => ipcRenderer.invoke('history:get', id),
  deleteCall: (id) => ipcRenderer.invoke('history:delete', id),
  openHistoryFolder: () => ipcRenderer.invoke('history:open-folder'),
  makeMinutes: (id) => ipcRenderer.invoke('minutes:make', id),
  saveMinutes: (id, md, name) => ipcRenderer.invoke('minutes:save', id, md, name),
  startShare: () => ipcRenderer.invoke('share:start'),
  stopShare: () => ipcRenderer.invoke('share:stop'),
  resolveSuggestion: (id, accept) => ipcRenderer.invoke('suggestion:resolve', id, accept),
  renameSpeaker: (n, name) => ipcRenderer.invoke('speaker:rename', n, name),
  joinSession: (link) => ipcRenderer.invoke('session:join', link),
  onState: (cb) => {
    const listener = (_: IpcRendererEvent, s: AppState) => cb(s)
    ipcRenderer.on('state', listener)
    return () => ipcRenderer.removeListener('state', listener)
  },
  isOverlay: process.argv.includes('--overlay'),
}

contextBridge.exposeInMainWorld('api', api)
