import { useCallback, useState } from 'react'
import { Canvas } from './components/Canvas'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ModeBar } from './components/ModeBar'
import { Overlay } from './components/Overlay'
import { SettingsDialog } from './components/SettingsDialog'
import { SidePanel } from './components/SidePanel'
import { TitleBar } from './components/TitleBar'
import { Toasts } from './components/Toasts'
import { api, useAppState, useModes } from './hooks'

export function App() {
  const state = useAppState()
  const modes = useModes()
  const [settings, setSettings] = useState(false)
  const openSettings = useCallback(() => setSettings(true), [])
  const closeSettings = useCallback(() => setSettings(false), [])

  if (!state) return null
  if (api.isOverlay)
    return (
      <ErrorBoundary>
        <Overlay state={state} />
      </ErrorBoundary>
    )

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TitleBar state={state} onSettings={openSettings} />
      <ModeBar modes={modes} mode={state.mode} activeMode={state.activeMode} />
      <main className="flex min-h-0 flex-1">
        <section className="relative min-w-0 flex-1">
          <ErrorBoundary>
            <Canvas state={state} modeName={modes.find((m) => m.id === state.activeMode)?.name} onSettings={openSettings} />
          </ErrorBoundary>
          <Toasts error={state.error} speaking={state.speaking} />
        </section>
        <ErrorBoundary>
          <SidePanel lines={state.lines} checks={state.checks} checking={state.activity === 'checking'} />
        </ErrorBoundary>
      </main>
      <SettingsDialog open={settings} onClose={closeSettings} />
    </div>
  )
}
