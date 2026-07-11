import { childSessionStore } from '../store/childSessionStore'
import { notificationEventSettingsStore } from '../store/notificationEventSettingsStore'

export function shouldNotifySessionCompletion(sessionId: string): boolean {
  if (!childSessionStore.getSessionInfo(sessionId)) return true
  return notificationEventSettingsStore.isChildSessionCompletionEnabled()
}
