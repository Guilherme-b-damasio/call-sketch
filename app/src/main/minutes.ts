/**
 * Ata da call em Markdown: a IA le a conversa e tira resumo, decisoes, proximos passos e pontos
 * em aberto; o resto (data, diagramas, notas de validacao, transcricao) sai direto do historico,
 * sem passar pela IA, pra nao inventar nada.
 */
import { lineAuthor } from '@shared/speakers'
import type { CallRecord, Line } from '@shared/types'
import type { LLM } from './llm'

const MAX_TRANSCRIPT = 60_000 // caracteres mandados pra IA

export const MINUTES_PROMPT = `Voce escreve a ata de uma reuniao a partir da transcricao (reconhecimento de voz,
pode ter palavras trocadas: corrija pelo contexto, sem inventar). Tambem recebe os diagramas que foram
desenhados durante a call.

Responda em portugues, SOMENTE neste formato, sem mais nada:

TITULO: <titulo curto do assunto, ate 8 palavras>
RESUMO:
<2 a 5 frases dizendo do que se tratou e onde chegaram>
DECISOES:
- <decisao tomada>
ACOES:
- <tarefa> | <responsavel ou -> | <prazo ou ->
PENDENCIAS:
- <duvida ou assunto que ficou sem resposta>

Regras:
- So o que foi dito de fato. Sem decisao clara, nao invente: deixe a secao so com "- nenhuma".
- Responsavel e prazo so se alguem falou; senao use "-".
- Frases curtas e diretas, sem repetir a mesma coisa em secoes diferentes.`

export interface MinutesParts {
  title: string
  summary: string
  decisions: string[]
  actions: { task: string; who: string; when: string }[]
  open: string[]
}

function transcript(lines: Line[], names: CallRecord['speakers']): string {
  const all = lines.map((l) => `[${l.t}] ${lineAuthor(l, names)}: ${l.text}`)
  let text = all.join('\n')
  if (text.length <= MAX_TRANSCRIPT) return text
  // call muito longa: comeco e fim inteiros, o meio cortado
  const half = MAX_TRANSCRIPT / 2
  text = `${text.slice(0, half)}\n(... trecho do meio cortado ...)\n${text.slice(-half)}`
  return text
}

/** Ultima versao de cada aba, na ordem em que as abas apareceram. */
export function finalDiagrams(rec: CallRecord): { tabId: string; mode: string; mermaid: string }[] {
  const last = new Map<string, { tabId: string; mode: string; mermaid: string }>()
  for (const v of rec.versions) last.set(v.tabId, { tabId: v.tabId, mode: v.mode, mermaid: v.mermaid })
  return [...last.values()]
}

export function buildMinutesUser(rec: CallRecord, modeName: (id: string) => string): string {
  const diagrams = finalDiagrams(rec)
    .map((d) => `${modeName(d.mode) || 'Diagrama'}:\n\`\`\`mermaid\n${d.mermaid}\n\`\`\``)
    .join('\n\n')
  return `Diagramas desenhados:\n${diagrams || '(nenhum)'}\n\nTranscricao:\n${transcript(rec.lines, rec.speakers) || '(vazia)'}`
}

const NONE = /^(nenhum|nenhuma|nada|-|n\/a)\.?$/i

export function parseMinutes(text: string): MinutesParts {
  const out: MinutesParts = { title: '', summary: '', decisions: [], actions: [], open: [] }
  type Section = 'resumo' | 'decisoes' | 'acoes' | 'pendencias'
  let section: Section | null = null
  const summary: string[] = []
  for (const raw of text.replace(/```\w*/g, '').split(/\r?\n/)) {
    const line = raw.trim()
    const head = /^\**\s*(TITULO|T[IÍ]TULO|RESUMO|DECIS[OÕ]ES|A[CÇ][OÕ]ES|PEND[EÊ]NCIAS)\s*\**\s*:\s*\**\s*(.*)$/i.exec(line)
    if (head) {
      const key = head[1]
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
      const rest = head[2].trim()
      if (key === 'titulo') {
        out.title = rest.replace(/^["']|["']$/g, '')
        section = null
      } else {
        section = key as Section
        if (rest && section === 'resumo') summary.push(rest)
      }
      continue
    }
    if (!line || !section) continue
    if (section === 'resumo') {
      summary.push(line)
      continue
    }
    const item = line.replace(/^([-*•]|\d+[.)])\s*/, '').trim()
    if (!item || NONE.test(item)) continue
    if (section === 'decisoes') out.decisions.push(item)
    else if (section === 'pendencias') out.open.push(item)
    else {
      const [task, who = '-', when = '-'] = item.split('|').map((s) => s.trim())
      if (task && !NONE.test(task)) out.actions.push({ task, who: NONE.test(who) ? '' : who, when: NONE.test(when) ? '' : when })
    }
  }
  out.summary = summary.join(' ').trim()
  return out
}

function dateLine(rec: CallRecord): string {
  const a = new Date(rec.startedAt)
  const b = new Date(rec.endedAt)
  const day = a.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
  const hm = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const min = Math.max(1, Math.round((rec.endedAt - rec.startedAt) / 60000))
  return `**Data:** ${day}, das ${hm(a)} às ${hm(b)} (${min} min)`
}

const list = (items: string[], empty: string) => (items.length ? items.map((i) => `- ${i}`).join('\n') : `_${empty}_`)

/** Junta a parte da IA com o que vem direto do historico. */
export function renderMinutes(rec: CallRecord, parts: MinutesParts, modeName: (id: string) => string): string {
  const out: string[] = [`# ${parts.title || 'Ata da call'}`, '', dateLine(rec), '']
  out.push('## Resumo', '', parts.summary || '_A conversa foi curta demais pra resumir._', '')
  out.push('## Decisões', '', list(parts.decisions, 'Nenhuma decisão clara.'), '')
  out.push('## Próximos passos', '')
  out.push(
    parts.actions.length
      ? parts.actions
          .map((a) => `- [ ] ${a.task}${a.who ? ` — **${a.who}**` : ''}${a.when ? ` · até ${a.when}` : ''}`)
          .join('\n')
      : '_Nenhuma tarefa combinada._',
    '',
  )
  if (parts.open.length) out.push('## Pontos em aberto', '', list(parts.open, ''), '')

  const diagrams = finalDiagrams(rec)
  if (diagrams.length) {
    out.push('## Diagramas', '')
    diagrams.forEach((d, i) => out.push(`### ${modeName(d.mode) || `Diagrama ${i + 1}`}`, '', '```mermaid', d.mermaid, '```', ''))
  }

  if (rec.checks.length) {
    out.push('## Notas de validação', '')
    for (const c of rec.checks) out.push(`- ${c.kind === 'errado' ? '⚠️' : '❓'} ${c.text.replace(/^\[(ERRADO|DUVIDA)\]\s*/i, '')}`)
    out.push('')
  }

  const said = rec.lines.filter((l) => l.text.trim())
  if (said.length) {
    out.push('<details>', '<summary>Transcrição completa</summary>', '')
    for (const l of said) out.push(`- \`${l.t}\` **${lineAuthor(l, rec.speakers)}:** ${l.text}`)
    out.push('', '</details>', '')
  }
  return `${out.join('\n').trimEnd()}\n`
}

export async function makeMinutes(rec: CallRecord, llm: LLM, modeName: (id: string) => string): Promise<string> {
  const said = rec.lines.some((l) => l.who !== 'nota' && l.text.trim())
  const parts = said ? parseMinutes(await llm.ask(MINUTES_PROMPT, buildMinutesUser(rec, modeName))) : parseMinutes('')
  return renderMinutes(rec, parts, modeName)
}
