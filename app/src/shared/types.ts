/** Tipos compartilhados entre o processo principal (main) e a interface (renderer). */

export type Who = 'call' | 'eu' | 'nota'

export interface Line {
  id: number
  who: Who
  text: string
  t: string // HH:MM:SS
  ts: number // epoch em segundos
}

export type CheckKind = 'errado' | 'duvida'

export interface Check {
  id: number
  kind: CheckKind
  text: string
  t: string
}

export interface ModeInfo {
  id: string
  name: string
  description: string
  announce: string
}

export const AUTO = 'auto'

export type EngineState = 'starting' | 'ready' | 'error' | 'stopped'

export interface EngineInfo {
  state: EngineState
  msg?: string
  device?: 'gpu' | 'cpu'
  sources?: { who: string; name: string }[]
}

export type Activity = 'idle' | 'drawing' | 'checking'

export interface AppState {
  lines: Line[]
  checks: Check[]
  mermaid: string
  version: number
  mode: string // escolhido pelo usuario: "auto" ou id
  activeMode: string // o que esta sendo desenhado
  renderError: string | null
  paused: boolean
  activity: Activity
  error: string | null // ultimo erro do Claude
  speaking: string | null // texto que a voz esta falando
  engine: EngineInfo
  lastDrawAt: number | null
}

export interface Settings {
  backend: 'cli' | 'api'
  model: string // cli: sonnet|opus|haiku ; api: id do modelo
  apiKey: string
  drawGap: number // segundos minimos entre dois desenhos
  checkEvery: number // segundos; 0 desliga
  voice: boolean
  voiceName: string
  mic: boolean
  whisper: string
  language: string
  pythonPath: string // vazio = automatico
}

export const DEFAULT_SETTINGS: Settings = {
  backend: 'cli',
  model: 'sonnet',
  apiKey: '',
  drawGap: 4,
  checkEvery: 30,
  voice: true,
  voiceName: 'pt-BR-AntonioNeural',
  mic: true,
  whisper: 'auto',
  language: 'pt',
  pythonPath: '',
}

export const VOICES = [
  { id: 'pt-BR-AntonioNeural', name: 'Antonio' },
  { id: 'pt-BR-FranciscaNeural', name: 'Francisca' },
  { id: 'pt-BR-ThalitaMultilingualNeural', name: 'Thalita' },
]

/** API exposta pelo preload em window.api */
export interface Api {
  getState(): Promise<AppState>
  getModes(): Promise<ModeInfo[]>
  getSettings(): Promise<Settings>
  saveSettings(s: Settings): Promise<void>
  setMode(mode: string): Promise<void>
  redraw(): Promise<void>
  reset(): Promise<void>
  note(text: string): Promise<void>
  setPaused(paused: boolean): Promise<void>
  renderError(error: string | null): Promise<void>
  toggleOverlay(): Promise<void>
  openModesFolder(): Promise<void>
  onState(cb: (s: AppState) => void): () => void
  isOverlay: boolean
}
