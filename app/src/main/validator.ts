/** Um segundo Claude que confere afirmacoes tecnicas/factuais ditas na conversa. */
import type { LLM } from './claude'
import { buildCheckUser, CHECK_PROMPT, parseChecks } from './prompts'
import type { Store } from './store'

export class Validator {
  private checkedUpto = 0
  private timer: NodeJS.Timeout | null = null
  private busy = false

  constructor(
    private readonly store: Store,
    private readonly llm: () => LLM,
    private readonly every: () => number, // segundos; 0 desliga
  ) {}

  start(): void {
    this.stop()
    const secs = this.every()
    if (secs > 0) this.timer = setInterval(() => void this.step(), secs * 1000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async step(): Promise<boolean> {
    const s = this.store.state
    if (this.busy || s.paused) return false
    if (s.lines.length < this.checkedUpto) this.checkedUpto = 0 // reset
    if (s.lines.length === this.checkedUpto) return false
    this.busy = true
    try {
      const given = s.checks.slice(-15).map((c) => c.text)
      const out = await this.llm().ask(CHECK_PROMPT, buildCheckUser(s.lines.slice(-60), given))
      this.checkedUpto = s.lines.length
      const notes = parseChecks(out)
      if (notes.length) this.store.addChecks(notes)
    } catch (e) {
      console.error('validacao:', e)
    } finally {
      this.busy = false
    }
    return true
  }
}
