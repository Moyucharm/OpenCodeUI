import { notificationEventSettingsStore } from '../store/notificationEventSettingsStore'
import { getDesktopPlatform, isTauri } from './tauri'

const ATTENTION_DEDUPLICATION_MS = 500
const recentAttentionRequests = new Map<string, number>()

export async function requestTaskbarAttention(dedupeKey?: string): Promise<void> {
  if (!notificationEventSettingsStore.isTaskbarAttentionEnabled()) return
  if (!isTauri() || getDesktopPlatform() !== 'windows') return

  try {
    const { UserAttentionType, getAllWindows, getCurrentWindow } = await import('@tauri-apps/api/window')
    const windows = await getAllWindows()
    const focused = await Promise.all(windows.map(window => window.isFocused()))
    if (focused.some(Boolean)) return

    if (dedupeKey) {
      const now = Date.now()
      const lastRequest = recentAttentionRequests.get(dedupeKey)
      if (lastRequest !== undefined && now - lastRequest < ATTENTION_DEDUPLICATION_MS) return
      recentAttentionRequests.set(dedupeKey, now)
    }

    await getCurrentWindow().requestUserAttention(UserAttentionType.Informational)
  } catch {
    // Taskbar attention is a best-effort desktop enhancement.
  }
}
