/**
 * Servidor da sessao compartilhada. Roda no app de quem compartilha (o "host") e serve:
 *   /s/<codigo>/          pagina de quem assiste (viewer.html do renderer)
 *   /s/<codigo>/assets/*  js/css/fontes da pagina
 *   /s/<codigo>/state     o desenho atual, por long-polling
 *   /s/<codigo>/suggest   POST de uma sugestao de quem assiste (com limite de envio)
 * Qualquer outro caminho da 404: sem o codigo, nao se ve nada.
 *
 * Long-polling e nao SSE/stream: o tunel da Cloudflare segura respostas que nunca terminam.
 * Aqui cada resposta termina (no maximo em HOLD_MS), entao passa por qualquer tunel ou proxy,
 * e o desenho ainda chega na hora, porque a resposta pendente e liberada assim que ele muda.
 */
import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { networkInterfaces } from 'node:os'
import { extname, join, normalize, sep } from 'node:path'
import type { ShareView, SuggestionStatus } from '@shared/types'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

/** O que a pagina recebe a cada consulta. */
export interface StateReply {
  seq: number // aumenta a cada desenho novo
  view: ShareView | null
  ended: boolean
  suggest: boolean // quem compartilha esta aceitando sugestoes
  mine: MySuggestion[] // as ultimas sugestoes de quem perguntou e o que aconteceu com elas
}

export interface MySuggestion {
  id: string
  text: string
  status: SuggestionStatus
}

export interface IncomingSuggestion {
  id: string
  name: string
  text: string
}

export const SUGGESTION_MAX = 500 // caracteres
const NAME_MAX = 40
const BODY_MAX = 4096 // bytes
const PER_VIEWER = { gapMs: 5_000, perMin: 4 }
const ALL_PER_MIN = 20 // de todo mundo junto (o id de quem assiste e inventado pela pagina)
const KEEP_SUGGESTIONS = 300

/** Tira caractere de controle e espaco sobrando. */
function clean(s: unknown, max: number): string {
  return typeof s === 'string'
    ? [...s]
        .map((ch) => (ch < ' ' || ch === '\u007f' ? ' ' : ch))
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : ''
}

export function newToken(): string {
  return randomBytes(9).toString('base64url') // 12 caracteres, impossivel de chutar
}

/** IPv4 da rede local (pra quem esta no mesmo Wi-Fi/escritorio), ignorando adaptadores virtuais. */
export function lanAddress(): string | null {
  const virtual = /vethernet|virtualbox|vmware|docker|wsl|hyper-v|loopback|tailscale|zerotier/i
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    if (virtual.test(name)) continue
    for (const a of addrs ?? []) if (a.family === 'IPv4' && !a.internal) return a.address
  }
  return null
}

interface Waiter {
  res: ServerResponse
  timer: NodeJS.Timeout
  viewer: string
}

export interface SessionServerOptions {
  holdMs?: number // quanto uma consulta espera por novidade
  goneMs?: number // sem consultar ha esse tempo = saiu
}

export class SessionServer extends EventEmitter<{ viewers: [number]; suggestion: [IncomingSuggestion] }> {
  readonly token = newToken()
  private server: Server | null = null
  private view: ShareView | null = null
  private seq = 0
  private ended = false
  private waiters = new Set<Waiter>()
  private seen = new Map<string, number>() // id de quem assiste -> ultima consulta
  private count = 0
  private sweep: NodeJS.Timeout | null = null
  private accepting = true
  private sugs = new Map<string, { viewer: string } & MySuggestion>()
  private sent = new Map<string, number[]>() // quem assiste -> quando mandou
  private sentAll: number[] = []
  private readonly holdMs: number
  private readonly goneMs: number

  /** @param webDir pasta com viewer.html e assets/ (o renderer compilado) */
  constructor(
    private readonly webDir: string,
    opts: SessionServerOptions = {},
  ) {
    super()
    this.holdMs = opts.holdMs ?? 25_000 // abaixo dos ~100s que o tunel aguenta
    this.goneMs = opts.goneMs ?? this.holdMs + 15_000
  }

  get prefix(): string {
    return `/s/${this.token}/`
  }

  get viewers(): number {
    return this.count
  }

  async start(host = '0.0.0.0'): Promise<number> {
    const server = createServer((req, res) => void this.handle(req, res))
    this.server = server
    await new Promise<void>((ok, fail) => {
      server.once('error', fail)
      server.listen(0, host, ok)
    })
    this.sweep = setInterval(() => this.recount(), Math.min(5000, this.goneMs / 2))
    return (server.address() as AddressInfo).port
  }

  /** Desenho novo: guarda e libera na hora quem estava esperando. */
  publish(view: ShareView): void {
    this.view = view
    this.seq++
    this.flush()
  }

  /** Liga/desliga o campo de sugestao na pagina de quem assiste. */
  setAccepting(on: boolean): void {
    if (this.accepting === on) return
    this.accepting = on
    this.flush()
  }

  /** Quem compartilha decidiu: a pagina de quem mandou fica sabendo. */
  resolve(id: string, status: SuggestionStatus): void {
    const s = this.sugs.get(id)
    if (!s || s.status === status) return
    s.status = status
    this.flush()
  }

  async stop(): Promise<void> {
    if (this.sweep) clearInterval(this.sweep)
    this.ended = true
    this.flush() // avisa quem esta esperando que acabou
    const server = this.server
    this.server = null
    if (server) {
      server.closeAllConnections?.()
      await new Promise<void>((ok) => server.close(() => ok()))
    }
  }

  private reply(viewer = ''): StateReply {
    const mine: MySuggestion[] = []
    if (viewer) for (const s of this.sugs.values()) if (s.viewer === viewer) mine.push({ id: s.id, text: s.text, status: s.status })
    return { seq: this.seq, view: this.view, ended: this.ended, suggest: this.accepting && !this.ended, mine: mine.slice(-5) }
  }

  private flush(): void {
    for (const w of this.waiters) {
      clearTimeout(w.timer)
      sendJson(w.res, this.reply(w.viewer))
    }
    this.waiters.clear()
  }

  private recount(): void {
    const now = Date.now()
    for (const [id, at] of this.seen) if (now - at > this.goneMs) this.seen.delete(id)
    if (this.seen.size !== this.count) {
      this.count = this.seen.size
      this.emit('viewers', this.count)
    }
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://x')
    let path: string
    try {
      path = decodeURIComponent(url.pathname)
    } catch {
      return notFound(res)
    }
    if (req.method === 'GET' && path === this.prefix.slice(0, -1)) {
      res.writeHead(301, { Location: this.prefix }) // sem a barra final os caminhos relativos quebram
      return void res.end()
    }
    if (!path.startsWith(this.prefix)) return notFound(res)
    const rest = path.slice(this.prefix.length)
    if (req.method === 'POST' && rest === 'suggest') return this.suggest(req, res)
    if (req.method !== 'GET') return notFound(res)

    if (rest === 'state') return this.poll(req, res, url.searchParams)
    if (rest === '' || rest === 'index.html') return this.file(res, this.webDir, 'viewer.html')
    if (rest.startsWith('assets/')) return this.file(res, join(this.webDir, 'assets'), rest.slice('assets/'.length))
    return notFound(res)
  }

  private poll(req: IncomingMessage, res: ServerResponse, q: URLSearchParams): void {
    const id = (q.get('id') ?? '').slice(0, 40)
    if (id) {
      this.seen.set(id, Date.now())
      this.recount()
    }
    const since = Number(q.get('since') ?? -1)
    if (this.ended || since !== this.seq) return sendJson(res, this.reply(id)) // tem novidade (ou acabou)

    const waiter: Waiter = {
      res,
      viewer: id,
      timer: setTimeout(() => {
        this.waiters.delete(waiter)
        sendJson(res, this.reply(id))
      }, this.holdMs),
    }
    this.waiters.add(waiter)
    req.on('close', () => {
      clearTimeout(waiter.timer)
      this.waiters.delete(waiter)
    })
  }

  private async suggest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return sendJson(res, { error: 'formato' }, 415)
    let raw: string
    try {
      raw = await readBody(req, BODY_MAX)
    } catch {
      return sendJson(res, { error: 'grande demais' }, 413)
    }
    let body: Record<string, unknown>
    try {
      body = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return sendJson(res, { error: 'formato' }, 400)
    }
    const viewer = clean(body.id, 40)
    const name = clean(body.name, NAME_MAX)
    const text = clean(body.text, SUGGESTION_MAX)
    if (!viewer || !text) return sendJson(res, { error: 'vazia' }, 400)
    if (!this.accepting || this.ended) return sendJson(res, { error: 'fechado' }, 403)

    const now = Date.now()
    const mine = (this.sent.get(viewer) ?? []).filter((t) => now - t < 60_000)
    this.sentAll = this.sentAll.filter((t) => now - t < 60_000)
    const last = mine.at(-1) ?? 0
    if (now - last < PER_VIEWER.gapMs || mine.length >= PER_VIEWER.perMin || this.sentAll.length >= ALL_PER_MIN)
      return sendJson(res, { error: 'devagar' }, 429)
    mine.push(now)
    this.sent.set(viewer, mine)
    this.sentAll.push(now)

    const id = newToken()
    this.sugs.set(id, { id, viewer, text, status: 'pendente' })
    if (this.sugs.size > KEEP_SUGGESTIONS) this.sugs.delete(this.sugs.keys().next().value!)
    this.emit('suggestion', { id, name, text })
    sendJson(res, { ok: true, id, mine: this.reply(viewer).mine })
  }

  /** Serve `rel` de dentro de `base`, e de nenhum outro lugar (nada de ../). */
  private async file(res: ServerResponse, base: string, rel: string): Promise<void> {
    const full = normalize(join(base, rel))
    if (!full.startsWith(normalize(base) + sep)) return notFound(res)
    try {
      const body = await readFile(full)
      const immutable = base !== this.webDir // assets: nomes com hash do vite
      res.writeHead(200, {
        'Content-Type': TYPES[extname(full)] ?? 'application/octet-stream',
        'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      })
      res.end(body)
    } catch {
      notFound(res)
    }
  }
}

function readBody(req: IncomingMessage, max: number): Promise<string> {
  return new Promise((ok, fail) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size <= max) chunks.push(c) // passou do limite: so deixa terminar de chegar, pra responder
    })
    req.on('end', () => (size > max ? fail(new Error('grande demais')) : ok(Buffer.concat(chunks).toString('utf-8'))))
    req.on('error', fail)
  })
}

function sendJson(res: ServerResponse, body: unknown, status = 200): void {
  if (res.writableEnded) return
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

function notFound(res: ServerResponse): void {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('nao encontrado')
}
