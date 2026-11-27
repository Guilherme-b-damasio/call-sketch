/** Prompts e leitura das respostas do Claude (funcoes puras). */
import { AUTO, type CheckKind, type Line } from '@shared/types'
import type { Mode } from './modes'

export const BASE_PROMPT = `Voce e um desenhista de quadro branco ao vivo. Recebe a transcricao de uma conversa
(reconhecimento de voz: pode ter palavras trocadas) e o diagrama atual, e devolve o diagrama
ATUALIZADO em Mermaid que representa o que esta sendo falado.

Regras gerais:
- Evolua o diagrama atual em vez de recomecar, a menos que o assunto ou o modo tenha mudado.
- Textos curtos em portugues: no maximo ~4 palavras por no. Rotulos sempre entre aspas: A["Texto"].
- Codigo Mermaid 11 valido, sem estilos, cores ou classDef. No maximo ~15 nos.
- Falas marcadas como "nota" sao pedidos diretos do usuario: obedeca.
- O usuario pode editar o diagrama a mao: mantenha o que ele mudou e os ids dos nos que ja existem.
- Se ainda nao ha nada desenhavel, devolva o diagrama atual.`

export const CHECK_PROMPT = `Voce e um revisor tecnico ouvindo uma conversa ao vivo.
Recebe a transcricao recente (reconhecimento de voz, pode ter palavras trocadas) e as notas que voce ja deu.
Aponte afirmacoes tecnicas ou factuais ERRADAS ou DUVIDOSAS (conceitos, comandos, numeros, como uma
tecnologia funciona, riscos de uma decisao) e diga a correcao em 1 frase curta.

Regras:
- Ignore papo, piadas e opinioes; so valide o que da pra checar.
- Na duvida se foi erro de transcricao, nao aponte.
- Nao repita notas ja dadas.
- No maximo 3 notas novas, em portugues, uma por linha, neste formato:
  - [ERRADO] "trecho dito" -> correcao
  - [DUVIDA] "trecho dito" -> o que conferir
- Se nao houver nada, responda exatamente: NADA`

export function buildSystem(modes: Map<string, Mode>, mode: string): string {
  if (mode !== AUTO) {
    const m = modes.get(mode)
    if (!m) throw new Error(`modo desconhecido: ${mode}`)
    return `${BASE_PROMPT}\n\nModo: ${m.name}\n${m.instructions}\n\nResponda SOMENTE com um bloco \`\`\`mermaid ... \`\`\`, sem explicacao.`
  }
  const catalog = [...modes.values()]
    .map((m) => `### ${m.id}\nQuando usar: ${m.description}\nComo desenhar:\n${m.instructions}`)
    .join('\n\n')
  return (
    `${BASE_PROMPT}\n\nEscolha o modo que melhor representa a conversa. Mantenha o modo atual, ` +
    `a menos que a conversa tenha claramente mudado de natureza.\n\nModos:\n\n${catalog}\n\n` +
    'Formato da resposta, sem mais nada:\nMODO: <id do modo>\n```mermaid\n...\n```'
  )
}

export function formatTranscript(lines: Line[]): string {
  return lines.map((l) => `[${l.t}] ${l.who}: ${l.text}`).join('\n')
}

export function buildUser(opts: {
  lines: Line[]
  current: string
  activeMode: string
  renderError: string | null
  modeChanged: boolean
  locked?: string[]
}): string {
  const parts = [
    `Modo atual: ${opts.activeMode || '(nenhum ainda)'}`,
    `Diagrama atual:\n\`\`\`mermaid\n${opts.current || '(vazio)'}\n\`\`\``,
    `Transcricao:\n${formatTranscript(opts.lines)}`,
  ]
  if (opts.locked?.length)
    parts.push(`Nos TRAVADOS pelo usuario (nao mude o texto, nao remova e nao troque as ligacoes deles): ${opts.locked.join(', ')}`)
  if (opts.modeChanged) parts.push('O MODO MUDOU: redesenhe o conteudo no formato do novo modo.')
  if (opts.renderError) parts.push(`O diagrama atual DEU ERRO ao renderizar, corrija a sintaxe: ${opts.renderError}`)
  return parts.join('\n\n')
}

/** -> [id do modo ou null, codigo mermaid] */
export function parseResponse(text: string): [string | null, string] {
  const mode = /^\s*MODO:\s*([\w-]+)/im.exec(text)
  const code = /```(?:mermaid)?\s*\n([\s\S]*?)```/.exec(text)
  return [mode ? mode[1].toLowerCase() : null, (code ? code[1] : text).trim()]
}

export function buildCheckUser(lines: Line[], given: string[]): string {
  return `Notas ja dadas:\n${given.join('\n') || '(nenhuma)'}\n\nTranscricao recente:\n${formatTranscript(lines)}`
}

export function parseChecks(text: string): { kind: CheckKind; text: string }[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- ['))
    .map((l) => l.slice(2))
    .map((l) => ({ kind: l.toUpperCase().startsWith('[DUVIDA]') ? 'duvida' : 'errado', text: l }))
}
