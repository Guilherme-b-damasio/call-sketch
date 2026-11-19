/** Configuracoes salvas em <userData>/settings.json. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DEFAULT_SETTINGS, type Settings } from '@shared/types'

export function loadSettings(file: string): Settings {
  try {
    if (existsSync(file)) return { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(file, 'utf-8')) }
  } catch (e) {
    console.error('configuracoes invalidas, usando o padrao:', e)
  }
  return { ...DEFAULT_SETTINGS }
}

export function saveSettings(file: string, s: Settings): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(s, null, 2), 'utf-8')
}
