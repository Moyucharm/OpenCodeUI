import { useCallback, useSyncExternalStore } from 'react'

export type RuntimeActivity =
  | { type: 'tool-input'; sessionID: string; callID: string; toolName: string }
  | { type: 'compaction'; sessionID: string }

type Listener = () => void

class RuntimeActivityStore {
  private activities = new Map<string, RuntimeActivity>()
  private listeners = new Set<Listener>()

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getActivity(sessionId: string | null): RuntimeActivity | null {
    if (!sessionId) return null
    return this.activities.get(sessionId) ?? null
  }

  setToolInput(sessionID: string, callID: string, toolName: string) {
    const activity: RuntimeActivity = { type: 'tool-input', sessionID, callID, toolName }
    this.setActivity(sessionID, activity)
  }

  clearToolInput(sessionID: string, callID: string) {
    const current = this.activities.get(sessionID)
    if (current?.type !== 'tool-input' || current.callID !== callID) return
    this.clearSession(sessionID)
  }

  setCompaction(sessionID: string) {
    this.setActivity(sessionID, { type: 'compaction', sessionID })
  }

  clearCompaction(sessionID: string) {
    const current = this.activities.get(sessionID)
    if (current?.type !== 'compaction') return
    this.clearSession(sessionID)
  }

  clearSession(sessionID: string) {
    if (!this.activities.delete(sessionID)) return
    this.notify()
  }

  private setActivity(sessionID: string, activity: RuntimeActivity) {
    const current = this.activities.get(sessionID)
    if (current && JSON.stringify(current) === JSON.stringify(activity)) return
    this.activities.set(sessionID, activity)
    this.notify()
  }

  private notify() {
    this.listeners.forEach(listener => listener())
  }
}

export const runtimeActivityStore = new RuntimeActivityStore()

export function useRuntimeActivity(sessionId: string | null): RuntimeActivity | null {
  const getSnapshot = useCallback(() => runtimeActivityStore.getActivity(sessionId), [sessionId])
  return useSyncExternalStore(runtimeActivityStore.subscribe, getSnapshot, getSnapshot)
}
