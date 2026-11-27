import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lineAuthor } from '@shared/speakers'
import { buildMinutesUser } from './minutes'
import { formatTranscript } from './prompts'
import { Store } from './store'
import { ensureVoiceModel } from './voices'

const bytes = Buffer.from('modelo de mentira '.repeat(1000))
const model = (sha = createHash('sha256').update(bytes).digest('hex')) => ({
  file: 'voz.onnx',
  url: 'https://exemplo/voz.onnx',
  sha256: sha,
  bytes: bytes.length,
})
const fakeFetch = (calls: string[]) =>
  (async (url: string) => {
    calls.push(url)
    return new Response(bytes, { headers: { 'content-length': String(bytes.length) } })
  }) as unknown as typeof fetch

describe('quem fala', () => {
  it('baixa o modelo uma vez, confere o sha e nao deixa arquivo pela metade', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cs-voz-'))
    const calls: string[] = []
    const pcts: number[] = []
    const path = await ensureVoiceModel(dir, (p) => pcts.push(p), model(), fakeFetch(calls))
    expect(readFileSync(path).equals(bytes)).toBe(true)
    expect(pcts.at(-1)).toBe(100)
    await ensureVoiceModel(dir, undefined, model(), fakeFetch(calls))
    expect(calls).toHaveLength(1) // ja estava baixado

    const bad = mkdtempSync(join(tmpdir(), 'cs-voz-'))
    await expect(ensureVoiceModel(bad, undefined, model('0'.repeat(64)), fakeFetch([]))).rejects.toThrow(/corrompido/)
    expect(readdirSync(bad)).toEqual([])
    expect(existsSync(join(bad, 'voz.onnx'))).toBe(false)
  })

  it('a IA e a ata recebem Pessoa N ou o nome dado', () => {
    const lines = [
      { id: 1, who: 'call' as const, text: 'oi', t: '10:00:00', ts: 0, speaker: 1 },
      { id: 2, who: 'call' as const, text: 'tudo bem', t: '10:00:05', ts: 0, speaker: 2 },
      { id: 3, who: 'eu' as const, text: 'bora', t: '10:00:09', ts: 0 },
      { id: 4, who: 'call' as const, text: 'sem voz', t: '10:00:10', ts: 0 },
    ]
    expect(formatTranscript(lines, { 2: 'Bia' })).toBe(
      '[10:00:00] Pessoa 1: oi\n[10:00:05] Bia: tudo bem\n[10:00:09] eu: bora\n[10:00:10] call: sem voz',
    )
    expect(lineAuthor(lines[3])).toBe('Call')
    const rec = { id: 'x', startedAt: 0, endedAt: 0, lines, checks: [], versions: [], speakers: { 1: 'Ana' } }
    expect(buildMinutesUser(rec, (m) => m)).toContain('[10:00:00] Ana: oi')
  })

  it('dar nome a uma pessoa, apagar o nome e limpar a call', () => {
    const store = new Store()
    store.renameSpeaker(1, '  Ana   Souza ')
    expect(store.state.speakers).toEqual({ 1: 'Ana Souza' })
    store.renameSpeaker(1, '   ')
    expect(store.state.speakers).toEqual({})
    store.renameSpeaker(2, 'x'.repeat(80))
    expect(store.state.speakers[2]).toHaveLength(30)
    store.reset()
    expect(store.state.speakers).toEqual({})
  })
})
