/** Tipos compartilhados entre o processo principal (main) e a interface (renderer). */

export type Who = 'call' | 'eu' | 'nota'

export interface Line {
  id: number
  who: Who
  text: string
  t: string // HH:MM:SS
  ts: number // epoch em segundos
  speaker?: number // so na call, com o reconhecimento de voz ligado: Pessoa 1, 2, ...
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

/** Um diagrama da call. Varios podem existir lado a lado (abas), todos da mesma conversa. */
/** Posicao (canto de cima a esquerda) de cada caixa que a pessoa arrumou, pelo id do no. */
export type Layout = Record<string, { x: number; y: number }>

/** Uma versao de um diagrama durante a call (pro replay). */
export interface DiagramVersion {
  ts: number // epoch em ms
  tabId: string
  mode: string
  mermaid: string
  layout?: Layout
  by: 'ia' | 'mao'
}

/** Uma call guardada no historico: do abrir (ou limpar) ate o proximo limpar. */
export interface CallRecord {
  id: string
  startedAt: number // ms
  endedAt: number
  lines: Line[]
  checks: Check[]
  versions: DiagramVersion[]
  minutes?: string // ata em Markdown, se ja foi gerada
  speakers?: Record<string, string> // nomes dados as pessoas da call
}

export interface CallSummary {
  id: string
  startedAt: number
  endedAt: number
  lines: number
  versions: number
  modes: string[]
  preview: string // comeco da conversa
  live: boolean // e a call de agora
}

/** Exportar: PNG (data URL) para png e pdf, texto do SVG para svg, e o tamanho em pixels de tela. */
export interface ExportRequest {
  kind: 'png' | 'svg' | 'pdf'
  data: string
  w: number
  h: number
  name: string
}

/** Edicao feita a mao no desenho (so o que veio muda). */
export interface DiagramEdit {
  tabId: string
  mermaid?: string
  layout?: Layout
  locked?: string[]
}

export interface Tab {
  layout: Layout
  locked: string[] // ids dos nos que a IA nao deve mexer
  id: string
  mode: string // "auto" ou id do modo
  activeMode: string // o que esta desenhado
  mermaid: string
}

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
  share: ShareInfo
  // mermaid/mode/activeMode/renderError acima sao sempre os da aba ativa
  tabs: Tab[]
  activeTab: string
  layout: Layout // da aba ativa
  locked: string[] // da aba ativa
  suggestions: Suggestion[] // de quem assiste, esperando aceitar/recusar
  speakers: Record<string, string> // nome dado a cada pessoa da call ("1" -> "Ana")
}

/** O que quem assiste a sessao recebe (so o desenho, nunca a conversa). */
export interface ShareView {
  mermaid: string
  version: number
  activeMode: string
  modeName: string
  activity: Activity
  paused: boolean
  layout?: Layout
}

export type ShareState = 'off' | 'starting' | 'on' | 'error'

/** Sugestao mandada por quem assiste; so vira nota quando quem compartilha aceita. */
export interface Suggestion {
  id: string
  name: string // pode vir vazio
  text: string
  t: string // HH:MM:SS
}

export type SuggestionStatus = 'pendente' | 'aceita' | 'recusada'

export interface ShareInfo {
  state: ShareState
  msg?: string
  publicUrl?: string // pelo tunel (qualquer rede)
  lanUrl?: string // mesma rede
  viewers: number
}

export interface Settings {
  backend: 'cli' | 'api' | 'openai'
  model: string // cli: sonnet|opus|haiku ; api: id do modelo
  apiKey: string
  // backend 'openai': qualquer servidor no formato da API da OpenAI (Ollama, Groq, Gemini...)
  llmPreset: string
  llmUrl: string
  llmKey: string
  llmModel: string
  drawGap: number // segundos minimos entre dois desenhos
  checkEvery: number // segundos; 0 desliga
  voice: boolean
  voiceName: string
  mic: boolean
  whisper: string
  language: string
  pythonPath: string // vazio = automatico
  history: boolean // guarda as calls no PC pra rever depois
  suggestions: boolean // quem assiste a sessao pode mandar sugestoes
  speakers: boolean // separa quem fala na call (baixa um modelo de ~26 MB na primeira vez)
}

export const DEFAULT_SETTINGS: Settings = {
  backend: 'cli',
  model: 'sonnet',
  apiKey: '',
  llmPreset: 'ollama',
  llmUrl: 'http://localhost:11434/v1',
  llmKey: '',
  llmModel: 'qwen2.5:7b',
  drawGap: 4,
  checkEvery: 30,
  voice: true,
  voiceName: 'pt-BR-AntonioNeural',
  mic: true,
  whisper: 'auto',
  language: 'pt',
  pythonPath: '',
  history: true,
  suggestions: true,
  speakers: true,
}

export interface LLMPreset {
  id: string
  name: string
  url: string
  needsKey: boolean
  model: string // sugestao; o botao de listar mostra os que existem de verdade
  keyUrl?: string // onde a pessoa pega a chave
  hint: string
}

/** Provedores que falam o formato da OpenAI. Cada pessoa usa o proprio PC ou a propria chave. */
export const LLM_PRESETS: LLMPreset[] = [
  {
    id: 'ollama',
    name: 'Ollama (no seu PC)',
    url: 'http://localhost:11434/v1',
    needsKey: false,
    model: 'qwen2.5:7b',
    hint: 'Grátis e offline. Instale pelo ollama.com e baixe um modelo: ollama pull qwen2.5:7b',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio (no seu PC)',
    url: 'http://localhost:1234/v1',
    needsKey: false,
    model: '',
    hint: 'Grátis e offline. No LM Studio, carregue um modelo e ligue o servidor local (aba Developer).',
  },
  {
    id: 'groq',
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1',
    needsKey: true,
    model: 'llama-3.3-70b-versatile',
    keyUrl: 'https://console.groq.com/keys',
    hint: 'Muito rápido, com plano grátis. A chave sai na hora.',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai',
    needsKey: true,
    model: 'gemini-2.5-flash',
    keyUrl: 'https://aistudio.google.com/apikey',
    hint: 'Tem plano grátis. A chave sai no Google AI Studio.',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1',
    needsKey: true,
    model: '',
    keyUrl: 'https://openrouter.ai/keys',
    hint: 'Centenas de modelos com uma chave só, vários de graça (os terminados em :free).',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    url: 'https://api.openai.com/v1',
    needsKey: true,
    model: 'gpt-4.1-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
    hint: 'Cobrado por uso, na sua conta da OpenAI.',
  },
  {
    id: 'custom',
    name: 'Outro endereço',
    url: '',
    needsKey: false,
    model: '',
    hint: 'Qualquer servidor compatível com a API da OpenAI (DeepSeek, Mistral, vLLM, llama.cpp...). A chave é opcional.',
  },
]

export interface LLMTest {
  ok: boolean
  msg: string
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
  listModels(s: Settings): Promise<string[]>
  testLLM(s: Settings): Promise<LLMTest>
  setMode(mode: string): Promise<void>
  addTab(mode: string): Promise<void>
  selectTab(id: string): Promise<void>
  closeTab(id: string): Promise<void>
  editDiagram(edit: DiagramEdit): Promise<void>
  saveExport(req: ExportRequest): Promise<string | null>
  listCalls(): Promise<CallSummary[]>
  getCall(id: string): Promise<CallRecord | null>
  deleteCall(id: string): Promise<void>
  openHistoryFolder(): Promise<void>
  /** Gera (pela IA) e guarda a ata da call em Markdown. */
  makeMinutes(id: string): Promise<string>
  /** Guarda a ata editada e abre o "Salvar como" do .md; volta o caminho ou null. */
  saveMinutes(id: string, md: string, name: string): Promise<string | null>
  redraw(): Promise<void>
  reset(): Promise<void>
  note(text: string): Promise<void>
  setPaused(paused: boolean): Promise<void>
  renderError(error: string | null): Promise<void>
  toggleOverlay(): Promise<void>
  openModesFolder(): Promise<void>
  startShare(): Promise<void>
  stopShare(): Promise<void>
  /** Aceitar vira nota pra IA; recusar so descarta. Quem mandou fica sabendo. */
  resolveSuggestion(id: string, accept: boolean): Promise<void>
  /** Da nome a uma pessoa da call (vazio volta a ser "Pessoa N"). */
  renameSpeaker(n: number, name: string): Promise<void>
  /** Abre a sessao de outra pessoa numa janela (aceita o link https ou callsketch://). */
  joinSession(link: string): Promise<void>
  onState(cb: (s: AppState) => void): () => void
  isOverlay: boolean
}
