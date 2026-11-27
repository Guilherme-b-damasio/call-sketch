import { AnimatePresence, LayoutGroup } from 'motion/react'
import { useCallback, useState } from 'react'
import { Canvas } from './components/Canvas'
import { ErrorBoundary } from './components/ErrorBoundary'
import { HistoryDialog } from './components/HistoryDialog'
import { ModeBar } from './components/ModeBar'
import { Overlay } from './components/Overlay'
import { SessionDialog } from './components/SessionDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { SidePanel } from './components/SidePanel'
import { Splash, shouldShowSplash } from './components/Splash'
import { TabStrip } from './components/Tabs'
import { TitleBar } from './components/TitleBar'
import { Toasts } from './components/Toasts'
import { api, useAppState, useModes } from './hooks'

export function App() {
  const state = useAppState()
  const modes = useModes()
  const [settings, setSettings] = useState(false)
  const openSettings = useCallback(() => setSettings(true), [])
  const closeSettings = useCallback(() => setSettings(false), [])
  const [session, setSession] = useState(false)
  const openSession = useCallback(() => setSession(true), [])
  const closeSession = useCallback(() => setSession(false), [])
  const [history, setHistory] = useState(false)
  const openHistory = useCallback(() => setHistory(true), [])
  const closeHistory = useCallback(() => setHistory(false), [])
  const [splash, setSplash] = useState(() => !api.isOverlay && shouldShowSplash())
  const endSplash = useCallback(() => setSplash(false), [])

  if (api.isOverlay) {
    if (!state) return null
    return (
      <ErrorBoundary>
        <Overlay state={state} />
      </ErrorBoundary>
    )
  }

  return (
    // a abertura termina com o icone e o nome voando para a barra de titulo (mesmo layoutId)
    <LayoutGroup>
      {state && (
        <div className="flex h-screen flex-col overflow-hidden">
          <TitleBar state={state} brand={!splash} onSettings={openSettings} onSession={openSession} onHistory={openHistory} />
          <ModeBar modes={modes} mode={state.mode} activeMode={state.activeMode} single={state.tabs.length < 2} />
          <TabStrip tabs={state.tabs} active={state.activeTab} modes={modes} />
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
          <SessionDialog open={session} share={state.share} onClose={closeSession} />
          <HistoryDialog open={history} onClose={closeHistory} modes={modes} />
        </div>
      )}
      <AnimatePresence>{splash && <Splash key="splash" onDone={endSplash} />}</AnimatePresence>
    </LayoutGroup>
  )
}
