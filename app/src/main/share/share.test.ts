import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ShareView } from '@shared/types'
import { Store } from '../store'
import { SessionServer, type StateReply } from './server'
import { parseJoinLink, viewOf } from './session'
import { cloudflaredAsset } from './tunnel'

function webDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cs-web-'))
  mkdirSync(join(dir, 'assets'))
  writeFileSync(join(dir, 'viewer.html'), '<html>viewer</html>')
  writeFileSync(join(dir, 'index.html'), '<html>app</html>')
  writeFileSync(join(dir, 'assets', 'a.js'), 'console.log(1)')
  writeFileSync(join(dir, 'segredo.txt'), 'nao')
  return dir
}

function get(port: number, path: string): Promise<{ status: number; body: string; type?: string }> {
  return new Promise((resolve, reject) => {
    request({ host: '127.0.0.1', port, path }, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body, type: res.headers['content-type'] }))
    })
      .on('error', reject)
      .end()
  })
}

function post(port: number, path: string, body: string, type = 'application/json'): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    request({ host: '127.0.0.1', port, path, method: 'POST', headers: { 'Content-Type': type } }, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }))
    })
      .on('error', reject)
      .end(body)
  })
}

async function poll(port: number, prefix: string, since: number, id = 'a'): Promise<StateReply> {
  const r = await get(port, `${prefix}state?since=${since}&id=${id}`)
  return JSON.parse(r.body) as StateReply
}

const VIEW: ShareView = { mermaid: 'flowchart TD\n A-->B', version: 3, activeMode: 'processo', modeName: 'Processo', activity: 'idle', paused: false }

describe('sugestoes de quem assiste', () => {
  let server: SessionServer | null = null
  afterEach(async () => {
    await server?.stop()
    server = null
  })

  it('chega pra quem compartilha, com limite, e quem mandou ve o resultado', async () => {
    server = new SessionServer(webDir())
    const port = await server.start('127.0.0.1')
    const p = server.prefix
    const got: { id: string; name: string; text: string }[] = []
    server.on('suggestion', (s) => got.push(s))
    const send = (o: unknown, type?: string) => post(port, `${p}suggest`, JSON.stringify(o), type)

    expect((await send({ id: 'v1', text: 'oi' }, 'text/plain')).status).toBe(415) // form de outro site nao passa
    expect((await send({ id: 'v1', text: '   ' })).status).toBe(400)
    expect((await post(port, '/s/chute/suggest', '{}')).status).toBe(404)
    expect((await post(port, `${p}suggest`, 'x'.repeat(5000))).status).toBe(413)

    const ok = await send({ id: 'v1', name: ' Ana\u0000 ', text: 'falta o\ncache   redis' })
    expect(ok.status).toBe(200)
    expect(got).toEqual([{ id: JSON.parse(ok.body).id, name: 'Ana', text: 'falta o cache redis' }])
    expect((await send({ id: 'v1', text: 'outra logo em seguida' })).status).toBe(429)

    const mine = await poll(port, p, -1, 'v1')
    expect(mine.suggest).toBe(true)
    expect(mine.mine).toEqual([{ id: got[0].id, text: 'falta o cache redis', status: 'pendente' }])
    expect((await poll(port, p, -1, 'v2')).mine).toEqual([]) // nao ve a dos outros

    const waiting = poll(port, p, mine.seq, 'v1') // a decisao libera quem estava esperando
    await new Promise((r) => setTimeout(r, 150)) // da tempo do pedido chegar e ficar esperando
    server.resolve(got[0].id, 'aceita')
    expect((await waiting).mine[0].status).toBe('aceita')

    server.setAccepting(false)
    expect((await poll(port, p, -1, 'v3')).suggest).toBe(false)
    expect((await send({ id: 'v3', text: 'posso?' })).status).toBe(403)
  })

  it('aceitar vira nota pra IA e a fila nao repete', () => {
    const store = new Store()
    expect(store.addSuggestion({ id: 's1', name: 'Ana', text: 'Faltou o Redis' })).toBe(true)
    expect(store.addSuggestion({ id: 's2', name: 'Bia', text: 'faltou o redis' })).toBe(false)
    expect(store.resolveSuggestion('s1', true)?.text).toBe('Faltou o Redis')
    expect(store.state.suggestions).toEqual([])
    expect(store.state.lines.at(-1)).toMatchObject({ who: 'nota', text: 'Sugestão de Ana: Faltou o Redis' })
    expect(store.resolveSuggestion('s1', true)).toBeNull()
  })
})

describe('servidor da sessao', () => {
  let server: SessionServer | null = null
  afterEach(async () => {
    await server?.stop()
    server = null
  })

  it('so responde com o codigo da sessao e nunca fora da pasta', async () => {
    server = new SessionServer(webDir())
    const port = await server.start('127.0.0.1')
    const p = server.prefix
    expect((await get(port, '/')).status).toBe(404)
    expect((await get(port, '/s/chute-qualquer/')).status).toBe(404)
    expect((await get(port, `${p}`)).body).toBe('<html>viewer</html>')
    expect((await get(port, p.slice(0, -1))).status).toBe(301)
    const js = await get(port, `${p}assets/a.js`)
    expect(js.status).toBe(200)
    expect(js.type).toContain('javascript')
    expect((await get(port, `${p}index.html`)).body).toBe('<html>viewer</html>') // o app em si nao e servido
    expect((await get(port, `${p}segredo.txt`)).status).toBe(404)
    expect((await get(port, `${p}assets/../segredo.txt`)).status).toBe(404)
    expect((await get(port, `${p}assets/..%2fsegredo.txt`)).status).toBe(404)
  })

  it('quem entra recebe o desenho atual na hora', async () => {
    server = new SessionServer(webDir(), { holdMs: 2000 })
    const port = await server.start('127.0.0.1')
    server.publish(VIEW)
    const t = Date.now()
    const r = await poll(port, server.prefix, -1)
    expect(Date.now() - t).toBeLessThan(500)
    expect(r).toMatchObject({ seq: 1, view: VIEW, ended: false })
  })

  it('segura a consulta e libera assim que sai desenho novo', async () => {
    server = new SessionServer(webDir(), { holdMs: 5000 })
    const port = await server.start('127.0.0.1')
    server.publish(VIEW)
    const t = Date.now()
    const pending = poll(port, server.prefix, 1)
    setTimeout(() => server!.publish({ ...VIEW, version: 4 }), 200)
    const r = await pending
    expect(Date.now() - t).toBeLessThan(2000)
    expect(r.seq).toBe(2)
    expect(r.view?.version).toBe(4)
  })

  it('sem novidade responde no tempo limite com o mesmo desenho', async () => {
    server = new SessionServer(webDir(), { holdMs: 200 })
    const port = await server.start('127.0.0.1')
    server.publish(VIEW)
    const r = await poll(port, server.prefix, 1)
    expect(r.seq).toBe(1)
  })

  it('conta quem esta assistindo e esquece quem sumiu', async () => {
    server = new SessionServer(webDir(), { holdMs: 100, goneMs: 300 })
    const port = await server.start('127.0.0.1')
    const counts: number[] = []
    server.on('viewers', (n) => counts.push(n))
    await Promise.all([poll(port, server.prefix, 0, 'a'), poll(port, server.prefix, 0, 'b'), poll(port, server.prefix, 0, 'a')])
    expect(server.viewers).toBe(2)
    await expect.poll(() => server!.viewers, { timeout: 3000 }).toBe(0)
    expect(counts).toEqual([1, 2, 0])
  })

  it('avisa quem esta esperando quando a sessao acaba', async () => {
    server = new SessionServer(webDir(), { holdMs: 5000 })
    const port = await server.start('127.0.0.1')
    const pending = poll(port, server.prefix, 0)
    await new Promise((r) => setTimeout(r, 100))
    await server.stop()
    server = null
    expect((await pending).ended).toBe(true)
  })

  it('codigos diferentes a cada sessao', () => {
    const a = new SessionServer('x').token
    const b = new SessionServer('x').token
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9_-]{12}$/)
  })
})

describe('links de sessao', () => {
  const page = 'https://abc-def.trycloudflare.com/s/AbCdEfGh1234/'
  it('aceita o link https, sem barra, sem https e o callsketch://', () => {
    expect(parseJoinLink(page)).toBe(page)
    expect(parseJoinLink(' https://abc-def.trycloudflare.com/s/AbCdEfGh1234 ')).toBe(page)
    expect(parseJoinLink('abc-def.trycloudflare.com/s/AbCdEfGh1234/?app=1')).toBe(page)
    expect(parseJoinLink(`callsketch://join?url=${encodeURIComponent(page)}`)).toBe(page)
    expect(parseJoinLink('http://192.168.0.10:5123/s/AbCdEfGh1234/')).toBe('http://192.168.0.10:5123/s/AbCdEfGh1234/')
  })

  it('recusa o que nao e link de sessao', () => {
    for (const bad of ['', 'oi', 'https://google.com', 'https://x.com/s/', 'file:///s/AbCdEfGh1234/', 'javascript:alert(1)'])
      expect(parseJoinLink(bad), bad).toBeNull()
  })
})

describe('tunel', () => {
  it('escolhe o cloudflared certo de cada sistema', () => {
    expect(cloudflaredAsset('win32', 'x64')).toBe('cloudflared-windows-amd64.exe')
    expect(cloudflaredAsset('darwin', 'arm64')).toBe('cloudflared-darwin-arm64.tgz')
    expect(cloudflaredAsset('darwin', 'x64')).toBe('cloudflared-darwin-amd64.tgz')
    expect(cloudflaredAsset('linux', 'x64')).toBe('cloudflared-linux-amd64')
    expect(cloudflaredAsset('linux', 'arm64')).toBe('cloudflared-linux-arm64')
  })
})

describe('o que quem assiste recebe', () => {
  it('so o desenho, nunca a conversa', () => {
    const store = new Store()
    store.addLine({ id: 1, who: 'eu', text: 'segredo da call', t: '10:00:00', ts: 0 })
    store.setDiagram('flowchart TD\n A-->B', 'processo')
    const view = viewOf(store.state, () => 'Processo')
    expect(JSON.stringify(view)).not.toContain('segredo')
    expect(view).toMatchObject({ activeMode: 'processo', modeName: 'Processo', mermaid: 'flowchart TD\n A-->B' })
  })
})
