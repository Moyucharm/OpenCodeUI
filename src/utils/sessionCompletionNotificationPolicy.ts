import { childSessionStore } from '../store/childSessionStore'
import { notificationEventSettingsStore } from '../store/notificationEventSettingsStore'
import { getSession } from '../api/session'

export async function shouldNotifySessionCompletion(sessionId: string, directory?: string): Promise<boolean> {
  if (childSessionStore.getSessionInfo(sessionId)) {
    return notificationEventSettingsStore.isChildSessionCompletionEnabled()
  }

  // session.created can arrive after completion, so resolve unknown sessions
  // before deciding whether this is a child-session completion.
  try {
    const session = await getSession(sessionId, directory)
    if (session.parentID) return notificationEventSettingsStore.isChildSessionCompletionEnabled()
    return true
  } catch {
    // Do not notify when the relationship cannot be confirmed. Completion is
    // non-interactive, unlike permission and question requests.
    return false
  }
}
