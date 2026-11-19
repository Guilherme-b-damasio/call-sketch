/** Configuracoes salvas em <userData>/settings.json. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DEFAULT_SETTINGS, type Settings } from '@shared/types'

export function loadSettings(file: string): Settings {
  try {
    if (existsSync(file)) {
      const saved = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>
      // so as chaves conhecidas (versoes antigas tinham outras, como drawEvery)
      const known = Object.fromEntries(Object.entries(saved).filter(([k]) => k in DEFAULT_SETTINGS))
      return { ...DEFAULT_SETTINGS, ...known }
    }
  } catch (e) {
    console.error('configuracoes invalidas, usando o padrao:', e)
  }
  return { ...DEFAULT_SETTINGS }
}

export function saveSettings(file: string, s: Settings): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(s, null, 2), 'utf-8')
}
