import { CircleCheck, CircleX, ExternalLink, FolderOpen, LoaderCircle, RefreshCw, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { LLM_PRESETS, type LLMTest, type Settings, VOICES } from '@shared/types'
import { api } from '../hooks'
import { cx } from './ui'

const CLI_MODELS = [
  { id: 'haiku', name: 'Haiku (rápido)' },
  { id: 'sonnet', name: 'Sonnet (equilibrado)' },
  { id: 'opus', name: 'Opus (melhor desenho)' },
]

const WHISPER = [
  { id: 'auto', name: 'Automático (GPU se tiver)' },
  { id: 'small', name: 'Small (leve)' },
  { id: 'medium', name: 'Medium' },
  { id: 'large-v3', name: 'Large v3 (precisa de GPU boa)' },
]

const LANGS = [
  { id: 'pt', name: 'Português' },
  { id: 'en', name: 'Inglês' },
  { id: 'es', name: 'Espanhol' },
]

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[140px_1fr] items-start gap-3">
      <span className="pt-2 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      <span className="flex flex-col gap-1">
        {children}
        {hint && <span className="text-[11px] leading-snug text-zinc-400 dark:text-zinc-500">{hint}</span>}
      </span>
    </label>
  )
}

const inputCls =
  'w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[13px] outline-none transition focus:border-accent-400 focus:ring-3 focus:ring-accent-500/15 dark:border-white/10 dark:bg-ink-900'

function Select<T extends string>({ value, options, onChange }: { value: T; options: { id: string; name: string }[]; onChange: (v: T) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} className={inputCls}>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative mt-1 h-5 w-9 rounded-full transition-colors',
        checked ? 'bg-accent-600' : 'bg-zinc-300 dark:bg-ink-600',
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 700, damping: 35 }}
        className={cx('absolute top-0.5 size-4 rounded-full bg-white shadow', checked ? 'right-0.5' : 'left-0.5')}
      />
    </button>
  )
}

/** Outra IA no formato da OpenAI: provedor, endereco, chave, modelo e um teste de conexao. */
function OtherAI({ s, setS }: { s: Settings; setS: (s: Settings) => void }) {
  const preset = LLM_PRESETS.find((p) => p.id === s.llmPreset) ?? LLM_PRESETS[LLM_PRESETS.length - 1]
  const [models, setModels] = useState<string[]>([])
  const [listing, setListing] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<LLMTest | null>(null)
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    setTest(null)
    setS({ ...s, [k]: v })
  }

  const list = async (quiet: boolean) => {
    setListing(true)
    try {
      setModels(await api.listModels(s))
      setListError(null)
    } catch (e) {
      setModels([])
      if (!quiet) setListError(String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, ''))
    } finally {
      setListing(false)
    }
  }

  // lista os modelos sozinho quando ja da pra perguntar (sem chave ou com a chave colada)
  const canList = !!s.llmUrl.trim() && (!preset.needsKey || !!s.llmKey.trim())
  // biome-ignore lint/correctness/useExhaustiveDependencies: so quando muda provedor, endereco ou chave
  useEffect(() => {
    setModels([])
    setListError(null)
    if (!canList) return
    const t = setTimeout(() => void list(true), 500)
    return () => clearTimeout(t)
  }, [s.llmUrl, s.llmKey, canList])

  const runTest = async () => {
    setTesting(true)
    setTest(null)
    try {
      setTest(await api.testLLM(s))
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <Field label="Provedor" hint={preset.hint}>
        <Select
          value={preset.id}
          options={LLM_PRESETS}
          onChange={(id) => {
            const p = LLM_PRESETS.find((x) => x.id === id)!
            setTest(null)
            setS({ ...s, llmPreset: p.id, llmUrl: p.url, llmModel: p.model, llmKey: '' })
          }}
        />
      </Field>
      <Field label="Endereço">
        <input
          value={s.llmUrl}
          onChange={(e) => set('llmUrl', e.target.value)}
          placeholder="http://localhost:11434/v1"
          spellCheck={false}
          className={inputCls}
        />
      </Field>
      {(preset.needsKey || preset.id === 'custom') && (
        <Field label="Chave" hint={preset.needsKey ? 'Fica salva só neste computador.' : 'Opcional.'}>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={s.llmKey}
              onChange={(e) => set('llmKey', e.target.value)}
              placeholder="cole a chave aqui"
              className={inputCls}
            />
            {preset.keyUrl && (
              <a
                href={preset.keyUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-accent-600 hover:underline dark:text-accent-300"
              >
                pegar chave <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </Field>
      )}
      <Field
        label="Modelo"
        hint={
          listError ??
          (models.length
            ? `${models.length} modelos disponíveis. Digite para filtrar.`
            : 'Escreva o nome ou clique em listar para ver os que existem.')
        }
      >
        <div className="flex items-center gap-2">
          <input
            value={s.llmModel}
            onChange={(e) => set('llmModel', e.target.value)}
            list="llm-models"
            placeholder="nome do modelo"
            spellCheck={false}
            className={inputCls}
          />
          <datalist id="llm-models">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <button
            type="button"
            title="Listar os modelos do provedor"
            onClick={() => void list(false)}
            disabled={listing || !s.llmUrl.trim()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[13px] font-medium hover:bg-zinc-900/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/6"
          >
            <RefreshCw className={cx('size-3.5', listing && 'animate-spin')} /> Listar
          </button>
        </div>
      </Field>
      <Field label="Teste">
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => void runTest()}
            disabled={testing || !s.llmUrl.trim() || !s.llmModel.trim()}
            className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[13px] font-medium hover:bg-zinc-900/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/6"
          >
            {testing ? <LoaderCircle className="size-3.5 animate-spin" /> : <CircleCheck className="size-3.5" />}
            {testing ? 'Testando…' : 'Testar'}
          </button>
          {test && (
            <span
              className={cx(
                'inline-flex items-start gap-1.5 text-[12px] leading-snug',
                test.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
              )}
            >
              {test.ok ? <CircleCheck className="mt-px size-3.5 shrink-0" /> : <CircleX className="mt-px size-3.5 shrink-0" />}
              {test.msg}
            </span>
          )}
        </div>
      </Field>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{title}</h3>
      {children}
    </section>
  )
}

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [s, setS] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) void api.getSettings().then(setS)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => (p ? { ...p, [k]: v } : p))

  const save = async () => {
    if (!s) return
    setSaving(true)
    try {
      await api.saveSettings(s)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <AnimatePresence>
      {open && s && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-6 backdrop-blur-sm dark:bg-black/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal
            aria-labelledby="settings-title"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ type: 'spring', stiffness: 500, damping: 36 }}
            className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 shadow-2xl dark:border-white/10 dark:bg-ink-850"
          >
            <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5 dark:border-white/8">
              <h2 id="settings-title" className="text-[15px] font-semibold tracking-tight">
                Configurações
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="grid size-7 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-900/5 dark:hover:bg-white/8"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="space-y-6 overflow-y-auto px-5 py-5">
              <Section title="Inteligência artificial">
                <Field
                  label="Conexão"
                  hint={
                    s.backend === 'cli'
                      ? 'Usa o Claude Code logado na sua conta (sem custo extra). Se pedir login, rode "claude" no terminal e digite /login.'
                      : s.backend === 'api'
                        ? 'Usa uma chave da API da Anthropic (cobrado por uso).'
                        : 'Qualquer IA no formato da OpenAI: um modelo no seu PC (grátis) ou a sua chave de um provedor.'
                  }
                >
                  <Select
                    value={s.backend}
                    options={[
                      { id: 'cli', name: 'Minha assinatura (Claude Code)' },
                      { id: 'api', name: 'Chave da Anthropic' },
                      { id: 'openai', name: 'Outra IA (Ollama, Groq, Gemini, OpenAI…)' },
                    ]}
                    onChange={(v) =>
                      setS({ ...s, backend: v, model: v === 'cli' ? 'sonnet' : v === 'api' ? 'claude-opus-5-5' : s.model })
                    }
                  />
                </Field>
                {s.backend === 'openai' ? (
                  <OtherAI s={s} setS={setS} />
                ) : s.backend === 'cli' ? (
                  <Field label="Modelo">
                    <Select value={s.model} options={CLI_MODELS} onChange={(v) => set('model', v)} />
                  </Field>
                ) : (
                  <>
                    <Field label="Chave da API">
                      <input
                        type="password"
                        value={s.apiKey}
                        onChange={(e) => set('apiKey', e.target.value)}
                        placeholder="sk-ant-…"
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Modelo">
                      <input value={s.model} onChange={(e) => set('model', e.target.value)} className={inputCls} />
                    </Field>
                  </>
                )}
                <Field label="Intervalo mínimo" hint="Ele redesenha a cada fala nova. Aumente para gastar menos do seu plano.">
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={60}
                      step={2}
                      value={s.drawGap}
                      onChange={(e) => set('drawGap', Number(e.target.value))}
                      className="flex-1 accent-accent-600"
                    />
                    <span className="w-10 text-right text-[13px] tabular-nums text-zinc-500">{s.drawGap}s</span>
                  </div>
                </Field>
                <Field label="Validar a cada" hint="0 desliga a segunda IA que confere o que foi dito.">
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={120}
                      step={10}
                      value={s.checkEvery}
                      onChange={(e) => set('checkEvery', Number(e.target.value))}
                      className="flex-1 accent-accent-600"
                    />
                    <span className="w-10 text-right text-[13px] tabular-nums text-zinc-500">
                      {s.checkEvery ? `${s.checkEvery}s` : 'off'}
                    </span>
                  </div>
                </Field>
              </Section>

              <Section title="Voz">
                <Field label="Anunciar o modo" hint="Avisa em voz alta quando muda o tipo de diagrama.">
                  <Toggle checked={s.voice} onChange={(v) => set('voice', v)} label="Anunciar o modo" />
                </Field>
                {s.voice && (
                  <Field label="Voz">
                    <Select value={s.voiceName} options={VOICES} onChange={(v) => set('voiceName', v)} />
                  </Field>
                )}
              </Section>

              <Section title="Áudio">
                <Field label="Microfone" hint="Desligado, só escuta o som do PC (a call).">
                  <Toggle checked={s.mic} onChange={(v) => set('mic', v)} label="Microfone" />
                </Field>
                <Field label="Transcrição">
                  <Select value={s.whisper} options={WHISPER} onChange={(v) => set('whisper', v)} />
                </Field>
                <Field label="Idioma">
                  <Select value={s.language} options={LANGS} onChange={(v) => set('language', v)} />
                </Field>
                <Field label="Python" hint="Vazio = automático. Só para quem roda o motor pelo código.">
                  <input
                    value={s.pythonPath}
                    onChange={(e) => set('pythonPath', e.target.value)}
                    placeholder="automático"
                    className={inputCls}
                  />
                </Field>
              </Section>

              <Section title="Modos">
                <Field label="Modos próprios" hint="Crie um arquivo .md na pasta pra adicionar ou sobrescrever um modo.">
                  <button
                    type="button"
                    onClick={() => void api.openModesFolder()}
                    className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[13px] font-medium hover:bg-zinc-900/5 dark:border-white/10 dark:hover:bg-white/6"
                  >
                    <FolderOpen className="size-3.5" /> Abrir pasta
                  </button>
                </Field>
              </Section>
            </div>

            <footer className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-white/8">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-zinc-600 hover:bg-zinc-900/5 dark:text-zinc-300 dark:hover:bg-white/6"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="rounded-lg bg-accent-600 px-3.5 py-1.5 text-[13px] font-medium text-white shadow-sm shadow-accent-600/30 hover:bg-accent-500 disabled:opacity-60"
              >
                Salvar
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
