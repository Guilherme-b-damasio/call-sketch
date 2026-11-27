/**
 * Modelo que reconhece as vozes (WeSpeaker ResNet34, ~26 MB), usado pelo motor pra separar quem
 * fala na call. Baixado do GitHub do sherpa-onnx na primeira vez e conferido pelo SHA-256.
 */
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export const VOICE_MODEL = {
  file: 'wespeaker_en_voxceleb_resnet34_LM.onnx',
  url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/wespeaker_en_voxceleb_resnet34_LM.onnx',
  sha256: 'e9848563da86f263117134dfd7ad63c92355b37de492b55e325400c9d9c39012',
  bytes: 26_530_550,
}

/** Garante o modelo em `dir` (baixa se faltar). Devolve o caminho. */
export async function ensureVoiceModel(
  dir: string,
  onProgress?: (pct: number) => void,
  model = VOICE_MODEL,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const path = join(dir, model.file)
  if (existsSync(path) && statSync(path).size === model.bytes) return path
  mkdirSync(dir, { recursive: true })

  const res = await fetcher(model.url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`não consegui baixar o modelo de vozes (HTTP ${res.status})`)
  const total = Number(res.headers.get('content-length')) || model.bytes
  const hash = createHash('sha256')
  let got = 0
  let last = -1
  const count = new Transform({
    transform(chunk: Buffer, _enc, done) {
      hash.update(chunk)
      got += chunk.length
      const pct = Math.min(100, Math.floor((got / total) * 100))
      if (pct !== last) onProgress?.((last = pct))
      done(null, chunk)
    },
  })
  const tmp = `${path}.part`
  try {
    await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), count, createWriteStream(tmp))
    if (hash.digest('hex') !== model.sha256) throw new Error('o modelo de vozes veio corrompido')
    renameSync(tmp, path)
  } finally {
    rmSync(tmp, { force: true })
  }
  return path
}
