import { RefreshCw } from 'lucide-react'
import { Component, type ReactNode } from 'react'

/** Um erro de render nao pode apagar o app inteiro: mostra o erro e deixa tentar de novo. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="flex max-w-sm flex-col items-center gap-2 text-center">
          <p className="text-sm font-semibold">Algo quebrou nesta parte da tela</p>
          <p className="line-clamp-3 text-xs text-zinc-500 dark:text-zinc-400">{error.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium hover:bg-zinc-900/5 dark:border-white/10 dark:hover:bg-white/6"
          >
            <RefreshCw className="size-3.5" /> Tentar de novo
          </button>
        </div>
      </div>
    )
  }
}
