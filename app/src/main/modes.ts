/**
 * Modos de desenho. Cada modo e um arquivo .md com cabecalho simples:
 *
 *   ---
 *   name: Brainstorm
 *   announce: Frase que o app fala quando entra no modo.
 *   description: Quando usar (o modo automatico le isso pra escolher).
 *   ---
 *   Instrucoes de como desenhar nesse modo.
 *
 * Os padrao ficam em resources/modes; os do usuario em <userData>/modes (sobrescrevem pelo nome).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ModeInfo } from '@shared/types'

export interface Mode extends ModeInfo {
  instructions: string
}

export function parseMode(id: string, text: string): Mode {
  const match = /^\s*---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!match) throw new Error(`modo '${id}' sem cabecalho ---`)
  const meta: Record<string, string> = {}
  for (const raw of match[1].split(/\r?\n/)) {
    const i = raw.indexOf(':')
    if (i > 0) meta[raw.slice(0, i).trim()] = raw.slice(i + 1).trim()
  }
  const missing = ['name', 'announce', 'description'].filter((k) => !meta[k])
  if (missing.length) throw new Error(`modo '${id}' sem ${missing.join(', ')}`)
  return {
    id,
    name: meta.name,
    announce: meta.announce,
    description: meta.description,
    instructions: match[2].trim(),
  }
}

export function loadModes(...dirs: string[]): Map<string, Mode> {
  const modes = new Map<string, Mode>()
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
      const id = file.slice(0, -3)
      try {
        modes.set(id, parseMode(id, readFileSync(join(dir, file), 'utf-8')))
      } catch (e) {
        console.error(String(e))
      }
    }
  }
  return new Map([...modes.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

export function modeInfo(m: Mode): ModeInfo {
  return { id: m.id, name: m.name, description: m.description, announce: m.announce }
}
