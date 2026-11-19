import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, globalShortcut, ipcMain, shell } from 'electron'
import { AUTO, type Settings } from '@shared/types'
import { type LLM, makeLLM } from './claude'
import { Engine, resolveEngine } from './engine'
import { loadModes, type Mode, modeInfo } from './modes'
import { loadSettings, saveSettings } from './settings'
import { fixShellPath } from './shellPath'
import { Sketcher } from './sketcher'
import { Store } from './store'
import { Validator } from './validator'

fixShellPath() // antes de procurar o claude e de iniciar o motor

const AUTO_ANNOUNCE = 'Modo automático. Vou escolher o melhor desenho conforme a conversa.'

const settingsFile = join(app.getPath('userData'), 'settings.json')
const userModesDir = join(app.getPath('userData'), 'modes')
const builtinModesDir = app.isPackaged
  ? join(process.resourcesPath, 'modes')
  : join(app.getAppPath(), 'resources', 'modes')

let settings: Settings = loadSettings(settingsFile)
let modes: Map<string, Mode> = loadModes(builtinModesDir, userModesDir)
let llm: LLM | null = null
let mainWin: BrowserWindow | null = null
let overlayWin: BrowserWindow | null = null

const store = new Store(AUTO)
const engine = new Engine()

function getLLM(): LLM {
  llm ??= makeLLM(settings)
  return llm
}

function say(text: string): void {
  if (settings.voice) engine.say(text, settings.voiceName)
}

const sketcher = new Sketcher(store, {
  gap: () => settings.drawGap,
  llm: getLLM,
  modes: () => modes,
  onModeChange: (m) => say(m.announce),
})
const validator = new Validator(store, getLLM, () => settings.checkEvery)

// ------------------------------------------------------------------ motor

function startEngine(): void {
  const command = resolveEngine(settings, { resourcesPath: process.resourcesPath, appPath: app.getAppPath() })
  if (!command) {
    store.setEngine({ state: 'error', msg: 'Motor de áudio não encontrado. Configure o Python nas configurações.' })
    return
  }
  store.setEngine({ state: 'starting', msg: 'iniciando o motor de áudio...' })
  engine.start(command, settings)
}

engine.on('event', (e) => {
  switch (e.type) {
    case 'status':
      store.setEngine({ ...store.state.engine, state: 'starting', msg: e.msg })
      break
    case 'ready':
      store.setEngine({ state: 'ready', device: e.device, sources: e.sources })
      break
    case 'line':
      store.addLine(e)
      break
    case 'remove':
      store.removeLines(e.ids)
      break
    case 'speaking':
      store.setSpeaking(e.on ? e.text : null)
      break
    case 'error':
      store.setEngine({ ...store.state.engine, msg: e.msg })
      break
  }
})

engine.on('exit', (code, stderr) => {
  if (store.state.engine.state === 'stopped') return
  const last = stderr.split('\n').filter(Boolean).pop()
  store.setEngine({ state: 'error', msg: `O motor de áudio parou (código ${code}). ${last ?? ''}`.trim() })
})

// ---------------------------------------------------------------- janelas

function loadRenderer(win: BrowserWindow): void {
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

function createMainWindow(): void {
  mainWin = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 900,
    minHeight: 560,
    show: false,
    backgroundColor: '#0a0a0c',
    title: 'Call Sketch',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#a1a1aa', height: 48 },
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true },
  })
  mainWin.once('ready-to-show', () => mainWin?.show())
  mainWin.on('closed', () => {
    mainWin = null
    overlayWin?.close()
  })
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  loadRenderer(mainWin)

  // so em dev: CS_SHOT=arquivo.png grava um print da janela a cada 4s (pra conferir a UI sem olhar a tela)
  const shot = !app.isPackaged && process.env.CS_SHOT
  if (shot) {
    const timer = setInterval(() => {
      if (!mainWin) return clearInterval(timer)
      void mainWin.webContents.capturePage().then((img) => writeFileSync(shot, img.toPNG()))
        .catch(() => {})
    }, 4000)
  }
}

function toggleOverlay(): void {
  if (overlayWin) {
    overlayWin.close()
    return
  }
  overlayWin = new BrowserWindow({
    width: 480,
    height: 360,
    minWidth: 280,
    minHeight: 200,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    title: 'Call Sketch',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      additionalArguments: ['--overlay'],
    },
  })
  overlayWin.setAlwaysOnTop(true, 'floating')
  overlayWin.once('ready-to-show', () => overlayWin?.showInactive())
  overlayWin.on('closed', () => (overlayWin = null))
  loadRenderer(overlayWin)
}

store.on('change', (s) => {
  for (const w of [mainWin, overlayWin]) if (w && !w.isDestroyed()) w.webContents.send('state', s)
})

// -------------------------------------------------------------------- IPC

function selectMode(mode: string): void {
  if (mode !== AUTO && !modes.has(mode)) throw new Error(`modo desconhecido: ${mode}`)
  const already = mode === store.state.activeMode // o automatico pode ter acabado de escolher
  store.setMode(mode)
  if (!already || mode === AUTO) say(mode === AUTO ? AUTO_ANNOUNCE : modes.get(mode)!.announce)
}

function applySettings(next: Settings): void {
  const prev = settings
  settings = next
  saveSettings(settingsFile, next)
  llm = null // recria com o backend/modelo novo
  store.setError(null)
  validator.start()
  const engineKeys: (keyof Settings)[] = ['whisper', 'language', 'mic', 'pythonPath']
  if (engineKeys.some((k) => prev[k] !== next[k])) startEngine()
}

ipcMain.handle('state:get', () => store.state)
ipcMain.handle('modes:get', () => {
  modes = loadModes(builtinModesDir, userModesDir) // pega modos novos da pasta do usuario
  return [...modes.values()].map(modeInfo)
})
ipcMain.handle('settings:get', () => settings)
ipcMain.handle('settings:save', (_, s: Settings) => applySettings(s))
ipcMain.handle('mode:set', (_, mode: string) => selectMode(mode))
ipcMain.handle('redraw', () => sketcher.requestNow())
ipcMain.handle('reset', () => store.reset())
ipcMain.handle('note', (_, text: string) => text.trim() && store.addNote(text.trim()))
ipcMain.handle('paused:set', (_, paused: boolean) => store.setPaused(paused))
ipcMain.handle('render:error', (_, err: string | null) => store.setRenderError(err))
ipcMain.handle('overlay:toggle', () => toggleOverlay())
ipcMain.handle('modes:open-folder', () => {
  mkdirSync(userModesDir, { recursive: true })
  return shell.openPath(userModesDir)
})

// ------------------------------------------------------------------ ciclo

app.whenReady().then(() => {
  createMainWindow()
  startEngine()
  sketcher.start()
  validator.start()

  globalShortcut.register('CommandOrControl+Shift+D', () => sketcher.requestNow())
  globalShortcut.register('CommandOrControl+Shift+O', () => toggleOverlay())
  globalShortcut.register('CommandOrControl+Shift+P', () => store.setPaused(!store.state.paused))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => app.quit())

app.on('before-quit', () => {
  globalShortcut.unregisterAll()
  sketcher.stop()
  validator.stop()
  store.setEngine({ state: 'stopped' })
  engine.stop()
})
