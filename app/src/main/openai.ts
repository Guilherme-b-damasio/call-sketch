/**
 * Qualquer IA no formato da API da OpenAI (/chat/completions): Ollama e LM Studio no proprio PC,
 * Groq, Gemini, OpenRouter, OpenAI, DeepSeek... Cada pessoa usa a propria maquina ou a propria chave.
 */
import { type LLM, LLMError } from './llm'

const TIMEOUT_MS = 180_000 // modelo local na CPU pode demorar

/** Tira o raciocinio que alguns modelos (DeepSeek R1, Qwen3...) mandam junto da resposta. */
export function cleanAnswer(text: string): string {
  return text
    .replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, '')
    .replace(/^[\s\S]*?<\/(think|thinking|reasoning)>/i, '') // fechou sem a abertura no texto
    .trim()
}

/** `localhost:11434/v1/` -> `http://localhost:11434/v1` (tira a barra e o /chat/completions colado junto). */
export function baseUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, '')
  if (u.endsWith('/chat/completions')) u = u.slice(0, -'/chat/completions'.length)
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`
  return u
}

function isLocal(url: string): boolean {
  try {
    return /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(new URL(url).hostname)
  } catch {
    return false
  }
}

function headers(key: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key.trim()) h.Authorization = `Bearer ${key.trim()}`
  return h
}

/** Erro de rede ou HTTP -> frase que a pessoa entende. */
export async function explain(res: Response | null, err: unknown, url: string, model?: string): Promise<LLMError> {
  if (!res) {
    if (err instanceof Error && err.name === 'TimeoutError') return new LLMError('A IA demorou demais para responder.')
    if (isLocal(url)) return new LLMError(`Não consegui falar com ${new URL(url).host}. O Ollama/LM Studio está aberto?`)
    const cause = err instanceof Error ? ((err.cause as Error | undefined)?.message ?? err.message) : String(err)
    return new LLMError(`Sem resposta de ${url}: ${cause}`)
  }
  let detail = ''
  try {
    const body = (await res.json()) as { error?: { message?: string } | string; message?: string }
    detail = typeof body.error === 'string' ? body.error : (body.error?.message ?? body.message ?? '')
  } catch {
    // corpo sem json
  }
  detail = detail.slice(0, 240)
  if (res.status === 401 || res.status === 403) return new LLMError(`Chave recusada (${res.status}). ${detail}`.trim())
  if (res.status === 429)
    return new LLMError(`Limite de uso do provedor (429). Aumente o intervalo nas configurações. ${detail}`.trim())
  if (res.status === 404 && model) return new LLMError(`Modelo "${model}" não encontrado (404). ${detail}`.trim())
  return new LLMError(`A IA respondeu ${res.status}. ${detail}`.trim())
}

export class OpenAICompat implements LLM {
  readonly name: string
  private readonly url: string

  constructor(
    url: string,
    private readonly key: string,
    private readonly model: string,
    provider?: string,
  ) {
    this.url = baseUrl(url)
    this.name = `${provider ?? new URL(this.url).host} · ${model}`
  }

  async ask(system: string, user: string): Promise<string> {
    let res: Response
    try {
      res = await fetch(`${this.url}/chat/completions`, {
        method: 'POST',
        headers: headers(this.key),
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          stream: false,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (e) {
      throw await explain(null, e, this.url)
    }
    if (!res.ok) throw await explain(res, null, this.url, this.model)
    const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[] }
    const text = cleanAnswer(body.choices?.[0]?.message?.content ?? '')
    if (!text) throw new LLMError('A IA respondeu vazio. Tente outro modelo.')
    return text
  }
}

/** Modelos que o servidor oferece (GET /models), em ordem alfabetica. */
export async function listModels(url: string, key: string): Promise<string[]> {
  const base = baseUrl(url)
  let res: Response
  try {
    res = await fetch(`${base}/models`, { headers: headers(key), signal: AbortSignal.timeout(15_000) })
  } catch (e) {
    throw await explain(null, e, base)
  }
  if (!res.ok) throw await explain(res, null, base)
  const body = (await res.json()) as { data?: { id?: string; name?: string }[] }
  const ids = (body.data ?? []).map((m) => (m.id ?? m.name ?? '').replace(/^models\//, ''))
  return [...new Set(ids.filter(Boolean))].sort((a, b) => a.localeCompare(b))
}
