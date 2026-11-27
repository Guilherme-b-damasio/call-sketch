/**
 * Ata de uma call: a IA escreve resumo, decisoes e proximos passos, o app junta diagramas, notas e
 * transcricao. Sai em Markdown, da pra mexer no texto antes de copiar ou salvar.
 */
import { ArrowLeft, Check, Copy, FileDown, NotebookPen, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CallRecord } from '@shared/types'
import { api } from '../hooks'

function fileName(rec: CallRecord, md: string): string {
  const title = /^#\s+(.+)$/m.exec(md)?.[1]?.trim() ?? 'Ata da call'
  const d = new Date(rec.startedAt)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${title}`
}

const btn =
  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-zinc-600 hover:bg-zinc-900/5 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-white/6'

export function MinutesView({
  rec,
  onBack,
  onSaved,
}: {
  rec: CallRecord
  onBack: () => void
  onSaved: (md: string) => void
}) {
  const [md, setMd] = useState(rec.minutes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<'copiado' | 'salvo' | null>(null)
  const started = useRef(false)

  const generate = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const out = await api.makeMinutes(rec.id)
      setMd(out)
      onSaved(out)
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setBusy(false)
    }
  }, [rec.id, onSaved])

  // abriu sem ata ainda: ja pede pra IA
  useEffect(() => {
    if (started.current || rec.minutes) return
    started.current = true
    void generate()
  }, [rec.minutes, generate])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 1600)
    return () => clearTimeout(t)
  }, [flash])

  const copy = async () => {
    await navigator.clipboard.writeText(md)
    setFlash('copiado')
  }
  const save = async () => {
    const path = await api.saveMinutes(rec.id, md, fileName(rec, md))
    onSaved(md)
    if (path) setFlash('salvo')
  }

  return (
    <section aria-label="Ata da call" className="flex min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-zinc-200 px-3 py-1.5 dark:border-white/8">
        <button type="button" onClick={onBack} className={btn}>
          <ArrowLeft className="size-3.5" /> Replay
        </button>
        <span className="mx-1 h-4 w-px bg-zinc-200 dark:bg-white/10" />
        <NotebookPen className="ml-1 size-4 text-accent-500" />
        <span className="text-[13px] font-semibold">Ata</span>
        <span className="ml-2 hidden text-xs text-zinc-500 sm:inline dark:text-zinc-400">Markdown · dá pra editar o texto antes de salvar</span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => void generate()} disabled={busy} className={btn}>
            <RefreshCw className={busy ? 'size-3.5 animate-spin' : 'size-3.5'} /> {md ? 'Gerar de novo' : 'Gerar'}
          </button>
          <button type="button" onClick={() => void copy()} disabled={busy || !md} className={btn}>
            {flash === 'copiado' ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />} Copiar
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !md}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-accent-500 disabled:opacity-40"
          >
            {flash === 'salvo' ? <Check className="size-3.5" /> : <FileDown className="size-3.5" />} Salvar .md
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="border-b border-rose-500/20 bg-rose-500/8 px-4 py-2 text-[13px] text-rose-600 dark:text-rose-400">
          Não deu pra gerar a ata: {error}
        </p>
      )}

      <div className="relative min-h-0 flex-1">
        {busy && !md ? (
          <div className="grid h-full place-items-center">
            <div className="flex flex-col items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="size-6 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
              A IA está lendo a call e escrevendo a ata…
            </div>
          </div>
        ) : (
          <textarea
            aria-label="Texto da ata"
            value={md}
            onChange={(e) => setMd(e.target.value)}
            spellCheck={false}
            placeholder="A ata aparece aqui."
            className="h-full w-full resize-none bg-transparent px-6 py-5 font-mono text-[13px] leading-relaxed text-zinc-800 outline-none dark:text-zinc-200"
          />
        )}
      </div>
    </section>
  )
}
