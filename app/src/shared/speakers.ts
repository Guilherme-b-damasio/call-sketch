/** Nome de quem falou cada linha: "Pessoa 1" (ou o nome que deram) na call, "voce" no microfone. */
import type { Line } from './types'

export type SpeakerNames = Record<string, string>

export function speakerName(n: number, names: SpeakerNames = {}): string {
  return names[n]?.trim() || `Pessoa ${n}`
}

/** Como a linha aparece pra IA e na ata. */
export function lineAuthor(line: Pick<Line, 'who' | 'speaker'>, names: SpeakerNames = {}): string {
  if (line.who === 'call') return line.speaker ? speakerName(line.speaker, names) : 'Call'
  return line.who === 'eu' ? 'Eu' : 'Nota'
}

export const MAX_SPEAKER_NAME = 30
