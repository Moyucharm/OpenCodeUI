import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PermissionNotificationAggregator } from './permissionNotificationAggregator'

interface Notice {
  sessionId: string
  requestId: string
  title: string
}

type Flush = (sessionId: string, notices: Notice[]) => void

describe('PermissionNotificationAggregator', () => {
  let flush: ReturnType<typeof vi.fn<Flush>>
  let aggregator: PermissionNotificationAggregator<Notice>

  beforeEach(() => {
    vi.useFakeTimers()
    flush = vi.fn<Flush>()
    aggregator = new PermissionNotificationAggregator(flush)
  })

  afterEach(() => {
    aggregator.dispose()
    vi.useRealTimers()
  })

  it('merges consecutive notices for one session using a trailing window', () => {
    const first = { sessionId: 'session-a', requestId: 'request-1', title: 'First' }
    const second = { sessionId: 'session-a', requestId: 'request-2', title: 'Second' }

    aggregator.enqueue(first)
    vi.advanceTimersByTime(400)
    aggregator.enqueue(second)
    vi.advanceTimersByTime(499)

    expect(flush).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)

    expect(flush).toHaveBeenCalledTimes(1)
    expect(flush).toHaveBeenCalledWith('session-a', [first, second])
  })

  it('flushes different sessions independently', () => {
    const first = { sessionId: 'session-a', requestId: 'request-1', title: 'First' }
    const second = { sessionId: 'session-b', requestId: 'request-2', title: 'Second' }

    aggregator.enqueue(first)
    aggregator.enqueue(second)
    vi.advanceTimersByTime(500)

    expect(flush).toHaveBeenCalledTimes(2)
    expect(flush).toHaveBeenCalledWith('session-a', [first])
    expect(flush).toHaveBeenCalledWith('session-b', [second])
  })

  it('does not flush notices resolved before the timer expires', () => {
    aggregator.enqueue({ sessionId: 'session-a', requestId: 'request-1', title: 'First' })
    aggregator.resolve('session-a', 'request-1')
    vi.advanceTimersByTime(500)

    expect(flush).not.toHaveBeenCalled()
  })

  it('does not duplicate a request within one session', () => {
    const notice = { sessionId: 'session-a', requestId: 'request-1', title: 'First' }

    aggregator.enqueue(notice)
    aggregator.enqueue({ ...notice, title: 'Duplicate' })
    vi.advanceTimersByTime(500)

    expect(flush).toHaveBeenCalledWith('session-a', [notice])
  })

  it('cancels one session without cancelling other scheduled flushes', () => {
    const first = { sessionId: 'session-a', requestId: 'request-1', title: 'First' }
    const second = { sessionId: 'session-b', requestId: 'request-2', title: 'Second' }

    aggregator.enqueue(first)
    aggregator.enqueue(second)
    aggregator.cancelSession('session-a')
    vi.advanceTimersByTime(500)

    expect(flush).toHaveBeenCalledTimes(1)
    expect(flush).toHaveBeenCalledWith('session-b', [second])
  })

  it('clear and dispose cancel scheduled flushes', () => {
    aggregator.enqueue({ sessionId: 'session-a', requestId: 'request-1', title: 'First' })
    aggregator.clear()
    aggregator.enqueue({ sessionId: 'session-b', requestId: 'request-2', title: 'Second' })
    aggregator.dispose()
    vi.advanceTimersByTime(500)

    expect(flush).not.toHaveBeenCalled()
  })
})
