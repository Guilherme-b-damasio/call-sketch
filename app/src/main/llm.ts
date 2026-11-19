/** O que o app pede de qualquer IA: instrucoes + conversa, volta texto. */
export interface LLM {
  readonly name: string
  ask(system: string, user: string): Promise<string>
}

export class LLMError extends Error {}
