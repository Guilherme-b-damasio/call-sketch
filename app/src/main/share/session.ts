/** Liga servidor + tunel, publica cada desenho novo e entende os links de entrada. */
import type { AppState, ShareView } from '@shared/types'
import type { Store } from '../store'
import { lanAddress, SessionServer } from './server'
import { ensureCloudflared, openTunnel, type Tunnel, waitResolvable } from './tunnel'

export const PROTOCOL = 'callsketch'

/** Link de sessao (https://.../s/<codigo>/ ou callsketch://join?url=...) -> URL http(s) da pagina. */
export function parseJoinLink(input: string): string | null {
  let text = input.trim()
  if (!text) return null
  if (text.startsWith(`${PROTOCOL}:`)) {
    try {
      text = new URL(text).searchParams.get('url') ?? ''
    } catch {
      return null
    }
  }
  if (!/^https?:\/\//i.test(text)) text = `https://${text}` // colaram sem o https://
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  const m = /^\/s\/([A-Za-z0-9_-]{8,})\/?/.exec(url.pathname)
  if (!m || (url.protocol !== 'https:' && url.protocol !== 'http:')) return null
  return `${url.origin}/s/${m[1]}/`
}

export function viewOf(s: AppState, modeName: (id: string) => string): ShareView {
  return {
    mermaid: s.mermaid,
    version: s.version,
    activeMode: s.activeMode,
    modeName: s.activeMode ? modeName(s.activeMode) : '',
    activity: s.activity === 'drawing' ? 'drawing' : 'idle',
    paused: s.paused,
    layout: s.layout,
  }
}

function sameView(a: ShareView | null, b: ShareView): boolean {
  return !!a && a.version === b.version && a.activity === b.activity && a.paused === b.paused && a.activeMode === b.activeMode
}

export class ShareSession {
  private server: SessionServer | null = null
  private tunnel: Tunnel | null = null
  private sent: ShareView | null = null
  private stopping = false

  constructor(
    private readonly store: Store,
    private readonly opts: { webDir: string; binDir: string; modeName: (id: string) => string; suggestions?: () => boolean },
  ) {
    store.on('change', (s) => this.push(s))
  }

  get active(): boolean {
    return this.server !== null
  }

  async start(): Promise<void> {
    if (this.server) return
    this.stopping = false
    const server = new SessionServer(this.opts.webDir)
    this.server = server
    this.sent = null
    this.store.setShare({ state: 'starting', msg: 'abrindo a sessão...', viewers: 0, publicUrl: undefined, lanUrl: undefined })
    try {
      const port = await server.start()
      server.on('viewers', (n) => this.store.setShare({ viewers: n }))
      server.on('suggestion', (s) => {
        if (!this.store.addSuggestion(s)) server.resolve(s.id, 'recusada') // fila cheia ou repetida
      })
      server.setAccepting(this.opts.suggestions?.() ?? true)
      this.push(this.store.state)
      const lan = lanAddress()
      const lanUrl = lan ? `http://${lan}:${port}${server.prefix}` : undefined
      this.store.setShare({ lanUrl, msg: 'preparando o túnel...' })

      const bin = await ensureCloudflared(this.opts.binDir, (pct) =>
        this.store.setShare({ msg: `baixando o túnel (só na primeira vez)... ${pct}%` }),
      )
      this.store.setShare({ msg: 'conectando à Cloudflare...' })
      const tunnel = await openTunnel(bin, port, () => this.onTunnelLost())
      if (this.stopping) return tunnel.stop()
      this.tunnel = tunnel
      // so mostra o link quando ele ja abre pra quem clicar (se demorar demais, mostra assim mesmo)
      this.store.setShare({ msg: 'publicando o link...' })
      await waitResolvable(new URL(tunnel.url).hostname)
      if (this.stopping) return
      this.store.setShare({ state: 'on', msg: undefined, publicUrl: `${tunnel.url}${server.prefix}` })
    } catch (e) {
      if (this.stopping) return
      // sem tunel ainda da pra usar na mesma rede
      const msg = e instanceof Error ? e.message : String(e)
      const lanOnly = !!this.store.state.share.lanUrl
      this.store.setShare({ state: lanOnly ? 'on' : 'error', msg: lanOnly ? `só na mesma rede: ${msg}` : msg })
      if (!lanOnly) await this.stop(false)
    }
  }

  async stop(reset = true): Promise<void> {
    this.stopping = true
    this.tunnel?.stop()
    this.tunnel = null
    const server = this.server
    this.server = null
    await server?.stop()
    this.store.clearSuggestions()
    if (reset) this.store.setShare({ state: 'off', msg: undefined, publicUrl: undefined, lanUrl: undefined, viewers: 0 })
  }

  /** Quem compartilha aceitou ou recusou uma sugestao. */
  resolve(id: string, accept: boolean): void {
    if (!this.store.resolveSuggestion(id, accept)) return
    this.server?.resolve(id, accept ? 'aceita' : 'recusada')
  }

  /** Configuracao mudou: liga/desliga o campo de sugestao de quem assiste. */
  refreshSuggestions(): void {
    const on = this.opts.suggestions?.() ?? true
    this.server?.setAccepting(on)
    if (!on) for (const s of this.store.state.suggestions) this.resolve(s.id, false)
  }

  private onTunnelLost(): void {
    if (this.stopping) return
    this.tunnel = null
    this.store.setShare({ publicUrl: undefined, msg: 'o túnel caiu; continua só na mesma rede. Pare e compartilhe de novo.' })
  }

  private push(s: AppState): void {
    if (!this.server) return
    const view = viewOf(s, this.opts.modeName)
    if (sameView(this.sent, view)) return
    this.sent = view
    this.server.publish(view)
  }
}
