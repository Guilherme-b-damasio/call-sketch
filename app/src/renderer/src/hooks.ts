import { useEffect, useState, useSyncExternalStore } from 'react'
import type { AppState, ModeInfo } from '@shared/types'

export const api = window.api

/** Estado vindo do processo principal (atualizado por push). */
export function useAppState(): AppState | null {
  const [state, setState] = useState<AppState | null>(null)
  useEffect(() => {
    let alive = true
    void api.getState().then((s) => alive && setState(s))
    const off = api.onState(setState)
    return () => {
      alive = false
      off()
    }
  }, [])
  return state
}

export function useModes(): ModeInfo[] {
  const [modes, setModes] = useState<ModeInfo[]>([])
  useEffect(() => {
    void api.getModes().then(setModes)
  }, [])
  return modes
}

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

export function useDark(): boolean {
  return useSyncExternalStore(
    (cb) => {
      darkQuery.addEventListener('change', cb)
      return () => darkQuery.removeEventListener('change', cb)
    },
    () => darkQuery.matches,
  )
}
