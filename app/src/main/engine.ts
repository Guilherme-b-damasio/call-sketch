/** Roda o motor de audio em Python (captura + Whisper + voz) e conversa com ele por linhas JSON. */
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import type { Settings } from '@shared/types'

export type EngineEvent =
  | { type: 'status'; msg: string }
  | { type: 'ready'; device: 'gpu' | 'cpu'; sources: { who: string; name: string }[] }
  | { type: 'line'; id: number; who: 'call' | 'eu'; text: string; t: string; ts: number; speaker?: number | null }
  | { type: 'remove'; ids: number[] }
  | { type: 'speaking'; on: boolean; text: string }
  | { type: 'error'; msg: string }

export interface EngineCommand {
  cmd: string
  args: string[]
}

/** Onde esta o motor: caminho configurado, executavel empacotado ou o venv do repositorio (dev). */
export function resolveEngine(s: Settings, opts: { resourcesPath: string; appPath: string }): EngineCommand | null {
  const exe = process.platform === 'win32' ? '.exe' : ''
  const packaged = join(opts.resourcesPath, 'engine', `call-sketch-engine${exe}`)
  if (!s.pythonPath && existsSync(packaged)) return { cmd: packaged, args: [] }

  const venv = resolve(opts.appPath, '..', 'engine', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  const python = s.pythonPath || (existsSync(venv) ? venv : null)
  return python ? { cmd: python, args: ['-m', 'call_sketch_engine'] } : null
}

export class Engine extends EventEmitter<{ event: [EngineEvent]; exit: [number | null, string] }> {
  private proc: ChildProcessWithoutNullStreams | null = null
  private stderrTail: string[] = []

  get running(): boolean {
    return this.proc !== null
  }

  start(command: EngineCommand, s: Settings, extra: { speakers?: string } = {}): void {
    this.stop()
    const args = [...command.args, '--whisper', s.whisper, '--language', s.language, '--max-phrase', '8']
    if (!s.mic) args.push('--no-mic')
    if (extra.speakers) args.push('--speakers', extra.speakers)
    const proc = spawn(command.cmd, args, {
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONUNBUFFERED: '1', HF_HUB_DISABLE_SYMLINKS_WARNING: '1' },
    })
    this.proc = proc
    this.stderrTail = []

    createInterface({ input: proc.stdout }).on('line', (raw) => {
      try {
        this.emit('event', JSON.parse(raw) as EngineEvent)
      } catch {
        console.log('[engine]', raw)
      }
    })
    createInterface({ input: proc.stderr }).on('line', (raw) => {
      console.log('[engine]', raw)
      this.stderrTail = [...this.stderrTail, raw].slice(-8)
    })
    proc.on('error', (e) => this.emit('event', { type: 'error', msg: e.message }))
    proc.on('exit', (code) => {
      if (this.proc === proc) this.proc = null
      this.emit('exit', code, this.stderrTail.join('\n'))
    })
  }

  /** Call nova: as vozes voltam a contar da Pessoa 1. */
  resetSpeakers(): void {
    this.send({ cmd: 'reset-speakers' })
  }

  say(text: string, voice: string): void {
    this.send({ cmd: 'say', text, voice })
  }

  stop(): void {
    const p = this.proc
    if (!p) return
    this.proc = null
    this.send({ cmd: 'stop' }, p)
    p.stdin.end()
    setTimeout(() => p.exitCode === null && p.kill(), 3000)
  }

  private send(msg: object, p = this.proc): void {
    if (p && !p.stdin.destroyed) p.stdin.write(`${JSON.stringify(msg)}\n`)
  }
}
