export interface PermissionNotificationNotice {
  sessionId: string
  requestId: string
}

type FlushCallback<T extends PermissionNotificationNotice> = (sessionId: string, notices: T[]) => void

export class PermissionNotificationAggregator<T extends PermissionNotificationNotice> {
  private readonly noticesBySession = new Map<string, Map<string, T>>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly onFlush: FlushCallback<T>
  private readonly delay: number

  constructor(onFlush: FlushCallback<T>, delay = 500) {
    this.onFlush = onFlush
    this.delay = delay
  }

  enqueue(notice: T) {
    let notices = this.noticesBySession.get(notice.sessionId)
    if (!notices) {
      notices = new Map()
      this.noticesBySession.set(notice.sessionId, notices)
    }

    if (notices.has(notice.requestId)) return

    notices.set(notice.requestId, notice)
    this.schedule(notice.sessionId)
  }

  resolve(sessionId: string, requestId: string) {
    const notices = this.noticesBySession.get(sessionId)
    if (!notices || !notices.delete(requestId)) return

    if (notices.size === 0) {
      this.noticesBySession.delete(sessionId)
      this.clearTimer(sessionId)
    }
  }

  cancelSession(sessionId: string) {
    this.noticesBySession.delete(sessionId)
    this.clearTimer(sessionId)
  }

  clear() {
    this.noticesBySession.clear()
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()
  }

  dispose() {
    this.clear()
  }

  private schedule(sessionId: string) {
    this.clearTimer(sessionId)
    this.timers.set(
      sessionId,
      setTimeout(() => {
        this.flush(sessionId)
      }, this.delay),
    )
  }

  private flush(sessionId: string) {
    this.timers.delete(sessionId)
    const notices = this.noticesBySession.get(sessionId)
    this.noticesBySession.delete(sessionId)
    if (!notices || notices.size === 0) return

    this.onFlush(sessionId, Array.from(notices.values()))
  }

  private clearTimer(sessionId: string) {
    const timer = this.timers.get(sessionId)
    if (timer) clearTimeout(timer)
    this.timers.delete(sessionId)
  }
}
