/**
 * Tunel gratuito da Cloudflare ("quick tunnel"): sem conta, sem cadastro, sem servidor nosso.
 * Da um link https://<palavras>.trycloudflare.com que chega no servidor local do host,
 * passando por qualquer roteador (o PC so faz conexao de saida).
 * O cloudflared e baixado do GitHub oficial na primeira vez que alguem compartilha.
 */
import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { Resolver } from 'node:dns/promises'
import { chmodSync, createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'

const RELEASES = 'https://github.com/cloudflare/cloudflared/releases/latest/download'
const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/
const READY_RE = /Registered tunnel connection/i

/** Nome do arquivo de release do cloudflared pra este sistema. */
export function cloudflaredAsset(platform = process.platform, arch = process.arch): string {
  const cpu = arch === 'arm64' ? 'arm64' : 'amd64'
  if (platform === 'win32') return 'cloudflared-windows-amd64.exe' // roda tambem no Windows ARM
  if (platform === 'darwin') return `cloudflared-darwin-${cpu}.tgz`
  return `cloudflared-linux-${cpu}`
}

/** Garante o cloudflared em `dir` (baixa se faltar). Devolve o caminho do executavel. */
export async function ensureCloudflared(dir: string, onProgress?: (pct: number) => void): Promise<string> {
  const bin = join(dir, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared')
  if (existsSync(bin)) return bin
  mkdirSync(dir, { recursive: true })

  const asset = cloudflaredAsset()
  const res = await fetch(`${RELEASES}/${asset}`, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`não consegui baixar o túnel (HTTP ${res.status})`)
  const total = Number(res.headers.get('content-length')) || 0
  let got = 0
  const tmp = join(dir, `${asset}.part`)
  const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream)
  body.on('data', (chunk: Buffer) => {
    got += chunk.length
    if (total) onProgress?.(Math.round((got / total) * 100))
  })
  await pipeline(body, createWriteStream(tmp))

  if (asset.endsWith('.tgz')) {
    await promisify(execFile)('tar', ['-xzf', tmp, '-C', dir]) // macOS: vem compactado
    rmSync(tmp)
  } else {
    renameSync(tmp, bin)
  }
  if (process.platform !== 'win32') chmodSync(bin, 0o755)
  return bin
}

export interface Tunnel {
  url: string
  stop(): void
}

/** Abre o tunel pro servidor local e espera a Cloudflare confirmar a conexao. */
export function openTunnel(bin: string, port: number, onClose: () => void, timeoutMs = 45_000): Promise<Tunnel> {
  return new Promise((resolve, reject) => {
    const proc: ChildProcess = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], {
      windowsHide: true,
    })
    let url: string | null = null
    let done = false
    const tail: string[] = []
    const stop = () => {
      if (proc.exitCode === null) proc.kill()
    }
    const finish = (err?: Error) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (err || !url) {
        stop()
        reject(err ?? new Error('o túnel não abriu'))
      } else resolve({ url, stop })
    }
    const timer = setTimeout(
      () => finish(url ? undefined : new Error('o túnel demorou demais para abrir (rede bloqueando?)')),
      timeoutMs,
    )
    const onData = (buf: Buffer) => {
      const text = buf.toString()
      tail.push(...text.split('\n').filter(Boolean))
      tail.splice(0, Math.max(0, tail.length - 6))
      url ??= URL_RE.exec(text)?.[0] ?? null
      if (url && READY_RE.test(text)) finish()
    }
    proc.stdout?.on('data', onData)
    proc.stderr?.on('data', onData) // o cloudflared escreve tudo no stderr
    proc.on('error', (e) => finish(e))
    proc.on('exit', (code) => {
      if (done) onClose() // caiu depois de aberto
      else finish(new Error(`o túnel fechou (código ${code}): ${tail.at(-1) ?? ''}`))
    })
  })
}

/**
 * Espera o endereco novo do tunel existir no DNS. Logo que o cloudflared conecta, o nome
 * *.trycloudflare.com ainda nao resolve por alguns segundos; quem abrir o link nessa hora
 * da de cara com "site nao encontrado" (e o Windows ainda guarda essa falha em cache).
 * Usa o resolvedor do Node direto nos servidores DNS, sem passar pelo cache do sistema.
 */
export async function waitResolvable(host: string, timeoutMs = 30_000, everyMs = 1000): Promise<boolean> {
  const resolver = new Resolver({ timeout: 3000, tries: 1 })
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    try {
      if ((await resolver.resolve4(host)).length > 0) return true
    } catch {
      // ainda nao existe
    }
    await new Promise((r) => setTimeout(r, everyMs))
  }
  return false
}
