/**
 * Servidor da sessao compartilhada. Roda no app de quem compartilha (o "host") e serve:
 *   /s/<codigo>/          pagina de quem assiste (viewer.html do renderer)
 *   /s/<codigo>/assets/*  js/css/fontes da pagina
 *   /s/<codigo>/state     o desenho atual, por long-polling
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
import type { ShareView } from '@shared/types'

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
}

export interface SessionServerOptions {
  holdMs?: number // quanto uma consulta espera por novidade
  goneMs?: number // sem consultar ha esse tempo = saiu
}

export class SessionServer extends EventEmitter<{ viewers: [number] }> {
  readonly token = newToken()
  private server: Server | null = null
  private view: ShareView | null = null
  private seq = 0
  private ended = false
  private waiters = new Set<Waiter>()
  private seen = new Map<string, number>() // id de quem assiste -> ultima consulta
  private count = 0
  private sweep: NodeJS.Timeout | null = null
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

  private reply(): StateReply {
    return { seq: this.seq, view: this.view, ended: this.ended }
  }

  private flush(): void {
    for (const w of this.waiters) {
      clearTimeout(w.timer)
      sendJson(w.res, this.reply())
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
    if (req.method !== 'GET' || !path.startsWith(this.prefix)) return notFound(res)
    const rest = path.slice(this.prefix.length)

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
    if (this.ended || since !== this.seq) return sendJson(res, this.reply()) // tem novidade (ou acabou)

    const waiter: Waiter = {
      res,
      timer: setTimeout(() => {
        this.waiters.delete(waiter)
        sendJson(res, this.reply())
      }, this.holdMs),
    }
    this.waiters.add(waiter)
    req.on('close', () => {
      clearTimeout(waiter.timer)
      this.waiters.delete(waiter)
    })
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

function sendJson(res: ServerResponse, body: unknown): void {
  if (res.writableEnded) return
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

function notFound(res: ServerResponse): void {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('nao encontrado')
}
