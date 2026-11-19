import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { app, BrowserWindow, globalShortcut, ipcMain, shell } from 'electron'
import { AUTO, type Settings } from '@shared/types'
import { type LLM, makeLLM } from './claude'
import { Engine, resolveEngine } from './engine'
import { loadModes, type Mode, modeInfo } from './modes'
import { loadSettings, saveSettings } from './settings'
import { fixShellPath } from './shellPath'
import { PROTOCOL, parseJoinLink, ShareSession } from './share/session'
import { Sketcher } from './sketcher'
import { Store } from './store'
import { Validator } from './validator'

fixShellPath() // antes de procurar o claude e de iniciar o motor

// um app so: clicar num link callsketch:// com o app aberto cai aqui na mesma instancia
if (!app.requestSingleInstanceLock()) app.exit(0) // ja tem um aberto: ele recebe o link
if (app.isPackaged) app.setAsDefaultProtocolClient(PROTOCOL)
else if (process.argv[1]) app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [resolve(process.argv[1])])

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
const share = new ShareSession(store, {
  webDir: join(__dirname, '../renderer'), // o renderer compilado (tem a viewer.html)
  binDir: join(app.getPath('userData'), 'bin'),
  modeName: (id) => modes.get(id)?.name ?? id,
})

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

// ----------------------------------------------------------- sessao de outra pessoa

const viewerWins = new Set<BrowserWindow>()
let pausedByViewer = false
let pendingLink: string | null = null

/** Abre a sessao de outra pessoa numa janela: e a mesma pagina do navegador, isolada (sem preload). */
function joinSession(link: string): void {
  const url = parseJoinLink(link)
  if (!url) throw new Error('Link de sessão inválido. Ele tem o formato https://…/s/código/')
  const origin = new URL(url).origin
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 480,
    minHeight: 320,
    title: 'Call Sketch · sessão',
    backgroundColor: '#0a0a0c',
    autoHideMenuBar: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e, to) => {
    if (new URL(to).origin !== origin) e.preventDefault() // nao sai da sessao
  })
  viewerWins.add(win)
  // assistindo a sessao de outra pessoa: pausa a sua escuta pra nao gastar o seu Claude
  if (!store.state.paused) {
    store.setPaused(true)
    pausedByViewer = true
  }
  win.on('closed', () => {
    viewerWins.delete(win)
    if (viewerWins.size === 0 && pausedByViewer) {
      pausedByViewer = false
      store.setPaused(false)
    }
  })
  // link recem-criado pode ainda nao existir no DNS, ou a rede piscou: tenta de novo por um tempo
  let tries = 0
  win.webContents.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
    if (!isMainFrame || code === -3 || win.isDestroyed()) return // -3: navegacao cancelada
    if (++tries > 15) return
    setTimeout(() => {
      if (!win.isDestroyed()) void win.loadURL(`${url}?app=1`)
    }, 2000)
  })
  win.webContents.on('did-finish-load', () => (tries = 0))
  void win.loadURL(`${url}?app=1`)
}

function handleLink(argv: string[]): void {
  const link = argv.find((a) => a.startsWith(`${PROTOCOL}:`))
  if (!link) return
  if (!app.isReady()) {
    pendingLink = link
    return
  }
  try {
    joinSession(link)
  } catch (e) {
    console.error(e)
  }
}

app.on('second-instance', (_e, argv) => {
  if (mainWin) {
    if (mainWin.isMinimized()) mainWin.restore()
    mainWin.focus()
  }
  handleLink(argv)
})
app.on('open-url', (e, url) => {
  e.preventDefault() // macOS
  handleLink([url])
})
handleLink(process.argv) // Windows/Linux: o app foi aberto pelo link

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
ipcMain.handle('share:start', () => share.start())
ipcMain.handle('share:stop', () => share.stop())
ipcMain.handle('session:join', (_, link: string) => joinSession(link))
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

  if (pendingLink) handleLink([pendingLink])

  // so em dev, pra testar a sessao sem clicar: CS_AUTOSHARE=1 compartilha ao abrir; CS_DEMO=1 poe um desenho
  if (!app.isPackaged && process.env.CS_DEMO) {
    const demo = ['flowchart TD', '  A["Cliente"] --> B["API Gateway"]', '  B --> C["Auth"]', '  B --> D[("Postgres")]']
    store.setDiagram(demo.join('\n'), 'arquitetura')
  }
  if (!app.isPackaged && process.env.CS_AUTOSHARE) {
    void share.start().then(() => {
      console.log('[sessao]', JSON.stringify(store.state.share))
      // CS_SELFJOIN=arquivo.png: o proprio app entra pelo link publico e grava um print da janela
      const shotFile = process.env.CS_SELFJOIN
      const url = store.state.share.publicUrl
      if (!shotFile || !url) return
      joinSession(url)
      const win = [...viewerWins].at(-1)
      win?.webContents.on('did-fail-load', (_e, code, desc) => console.log('[sessao] falhou ao carregar', code, desc))
      win?.webContents.on('console-message', (e) => console.log('[sessao] viewer:', e.message))
      setTimeout(() => {
        win?.webContents
          .executeJavaScript('[document.body.innerText, document.querySelectorAll("svg g.node").length].join(" | ")')
          .then((txt: string) => console.log('[sessao] janela de quem assiste:', txt.replace(/\s+/g, ' ')))
          .catch((err: unknown) => console.log('[sessao] leitura falhou', err))
        win?.webContents
          .capturePage()
          .then((img) => writeFileSync(shotFile, img.toPNG()))
          .catch(() => {}) // sem GPU o print pode falhar; o texto acima ja confirma
      }, 12_000)
    })
  }

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
  void share.stop(false)
})
