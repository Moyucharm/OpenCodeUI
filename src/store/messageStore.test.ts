import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiMessage, ApiMessageWithParts, ApiPart } from '../api/types'
import type { MessageError } from '../types/message'
import { messageStore } from './messageStore'

function createAssistantMessage(id: string, sessionID = 'session-1', created = 1): ApiMessage {
  return {
    id,
    sessionID,
    role: 'assistant',
    parentID: 'user-1',
    modelID: 'model-1',
    providerID: 'provider-1',
    mode: 'chat',
    agent: 'build',
    path: {
      cwd: '/workspace',
      root: '/workspace',
    },
    cost: 0,
    tokens: {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
    time: {
      created,
      completed: 2,
    },
  }
}

function createTextPart(
  id: string,
  messageID: string,
  text: string,
  sessionID = 'session-1',
): ApiPart & { sessionID: string; messageID: string } {
  return {
    id,
    sessionID,
    messageID,
    type: 'text',
    text,
  }
}

function createMessageWithParts(id: string, text: string, sessionID = 'session-1', created = 1): ApiMessageWithParts {
  return {
    info: createAssistantMessage(id, sessionID, created),
    parts: [createTextPart(`part-${id}`, id, text, sessionID)],
  }
}

function createIncompleteMessageWithParts(id: string, text: string, sessionID = 'session-1'): ApiMessageWithParts {
  const info = createAssistantMessage(id, sessionID)
  return {
    info: {
      ...info,
      time: { created: info.time.created },
    },
    parts: [createTextPart(`part-${id}`, id, text, sessionID)],
  }
}

describe('messageStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    messageStore.clearAll()
  })

  it('applies a part update when the message already exists', () => {
    messageStore.handleMessageUpdated(createAssistantMessage('message-1'))
    messageStore.handlePartUpdated(createTextPart('part-1', 'message-1', 'hello'))

    const state = messageStore.getSessionState('session-1')
    expect(state?.messages).toHaveLength(1)
    expect(state?.messages[0].parts).toHaveLength(1)
    expect(state?.messages[0].parts[0]).toMatchObject({ id: 'part-1', type: 'text', text: 'hello' })
  })

  it('silently drops a part update when the message does not exist yet', () => {
    // Part arrives before message — should be silently dropped (no pending queue)
    messageStore.handlePartUpdated(createTextPart('part-1', 'message-1', 'hello'))

    const state = messageStore.getSessionState('session-1')
    // session-1 doesn't exist because handlePartUpdated doesn't ensureSession
    expect(state).toBeUndefined()
  })

  it('marks cached sessions stale after reconnect and clears the flag after a fresh load', () => {
    messageStore.setMessages('session-1', [createMessageWithParts('message-1', 'hello')])

    expect(messageStore.isSessionStale('session-1')).toBe(false)

    messageStore.markAllSessionsStale()
    expect(messageStore.isSessionStale('session-1')).toBe(true)

    messageStore.setMessages('session-1', [createMessageWithParts('message-1', 'hello again')])
    expect(messageStore.isSessionStale('session-1')).toBe(false)
  })

  it('can load incomplete assistant history without marking the session as streaming', () => {
    messageStore.setMessages('session-1', [createIncompleteMessageWithParts('message-1', 'partial')], {
      inferStreaming: false,
    })

    const state = messageStore.getSessionState('session-1')
    expect(state?.isStreaming).toBe(false)
    expect(state?.messages[0].isStreaming).toBe(false)
  })

  it('accepts exported message envelopes that use message instead of info', () => {
    messageStore.setMessages('session-1', [
      {
        message: createAssistantMessage('message-1'),
        parts: [createTextPart('part-message-1', 'message-1', 'hello')],
      } as unknown as ApiMessageWithParts,
    ])

    const state = messageStore.getSessionState('session-1')
    expect(state?.messages).toHaveLength(1)
    expect(state?.messages[0].info.id).toBe('message-1')
    expect(state?.messages[0].parts[0]).toMatchObject({ id: 'part-message-1', type: 'text', text: 'hello' })
  })

  it('truncates messages after revert point', () => {
    messageStore.setMessages('session-1', [
      createMessageWithParts('message-1', 'one'),
      createMessageWithParts('message-2', 'two'),
      createMessageWithParts('message-3', 'three'),
    ])
    messageStore.setRevertState('session-1', {
      messageId: 'message-2',
      history: [],
    })

    messageStore.truncateAfterRevert('session-1')

    const state = messageStore.getSessionState('session-1')
    expect(state?.messages).toHaveLength(1)
    expect(state?.messages[0].info.id).toBe('message-1')
    expect(state?.revertState).toBeNull()
  })

  it('advances the local revert generation when sending consumes a revert', () => {
    messageStore.setMessages('session-1', [
      createMessageWithParts('message-1', 'one'),
      createMessageWithParts('message-2', 'two'),
    ])
    messageStore.setRevertState('session-1', {
      messageId: 'message-2',
      history: [],
    })
    const generationBeforeSend = messageStore.getSessionState('session-1')?.localRevertGeneration

    messageStore.truncateAfterRevert('session-1')

    expect(messageStore.getSessionState('session-1')).toMatchObject({
      revertState: null,
      localRevertGeneration: (generationBeforeSend ?? 0) + 1,
    })
  })

  it('removes a part from a message', () => {
    messageStore.setMessages('session-1', [createMessageWithParts('message-1', 'hello')])

    messageStore.handlePartRemoved({
      sessionID: 'session-1',
      messageID: 'message-1',
      partID: 'part-message-1',
    })

    const state = messageStore.getSessionState('session-1')
    expect(state?.messages[0].parts).toHaveLength(0)
  })

  it('deduplicates messages in prependMessages', () => {
    messageStore.setMessages('session-1', [createMessageWithParts('message-2', 'two')])

    messageStore.prependMessages(
      'session-1',
      [createMessageWithParts('message-1', 'one'), createMessageWithParts('message-2', 'duplicate')],
      true,
    )

    const state = messageStore.getSessionState('session-1')
    expect(state?.messages).toHaveLength(2)
    expect(state?.messages[0].info.id).toBe('message-1')
    expect(state?.messages[1].info.id).toBe('message-2')
  })

  it('creates a session when starting streaming', () => {
    messageStore.setStreaming('session-1', true)

    const state = messageStore.getSessionState('session-1')
    expect(state?.isStreaming).toBe(true)
    expect(state?.messages).toHaveLength(0)
    expect(state?.loadState).toBe('idle')
  })

  it('does not create a session when stopping streaming for a missing session', () => {
    messageStore.setStreaming('session-1', false)

    expect(messageStore.getSessionState('session-1')).toBeUndefined()
  })

  it('rejects a concurrent history load for the same session', () => {
    const firstGeneration = messageStore.beginHistoryLoad('session-1')
    const secondGeneration = messageStore.beginHistoryLoad('session-1')

    expect(firstGeneration).toEqual(expect.any(Number))
    expect(secondGeneration).toBeNull()
    expect(messageStore.getSessionState('session-1')).toMatchObject({
      isLoadingHistory: true,
      historyLoadError: undefined,
    })
  })

  it('ignores stale history completion after a session reload and commits the current completion', () => {
    const staleGeneration = messageStore.beginHistoryLoad('session-1')
    if (staleGeneration === null) throw new Error('Expected the first history load to start')

    messageStore.setLoadState('session-1', 'loading')

    expect(messageStore.isCurrentHistoryLoad('session-1', staleGeneration)).toBe(false)
    expect(
      messageStore.completeHistoryLoad('session-1', staleGeneration, {
        historyCursor: 'stale-cursor',
        paginationMode: 'cursor',
        hasMoreHistory: true,
      }),
    ).toBe(false)
    expect(messageStore.getSessionState('session-1')).toMatchObject({
      historyCursor: undefined,
      paginationMode: 'unknown',
      hasMoreHistory: false,
    })

    const currentGeneration = messageStore.beginHistoryLoad('session-1')
    if (currentGeneration === null) throw new Error('Expected the current history load to start')

    expect(
      messageStore.completeHistoryLoad('session-1', currentGeneration, {
        historyCursor: 'next-cursor',
        paginationMode: 'cursor',
        hasMoreHistory: true,
      }),
    ).toBe(true)
    expect(messageStore.getSessionState('session-1')).toMatchObject({
      historyCursor: 'next-cursor',
      paginationMode: 'cursor',
      hasMoreHistory: true,
      isLoadingHistory: false,
      historyLoadError: undefined,
    })
  })

  it('keeps loaded history and cursor when a latest-page refresh merges a 100-message session', () => {
    const history = Array.from({ length: 100 }, (_, index) => {
      const messageNumber = index + 1
      return createMessageWithParts(`message-${messageNumber}`, `message ${messageNumber}`, 'session-1', messageNumber)
    })
    messageStore.setMessages('session-1', history, {
      historyCursor: 'older-page',
      paginationMode: 'cursor',
      hasMoreHistory: true,
    })

    const generation = messageStore.beginHistoryLoad('session-1')
    if (generation === null) throw new Error('Expected the history load to start')

    messageStore.mergeMessages(
      'session-1',
      [
        createMessageWithParts('message-100', 'updated latest message', 'session-1', 100),
        createMessageWithParts('message-101', 'new latest message', 'session-1', 101),
      ],
      { preserveHistory: true },
    )

    const state = messageStore.getSessionState('session-1')
    expect(messageStore.isCurrentHistoryLoad('session-1', generation)).toBe(true)
    expect(state?.messages).toHaveLength(101)
    expect(state?.messages.map(message => message.info.id)).toEqual([
      ...Array.from({ length: 101 }, (_, index) => `message-${index + 1}`),
    ])
    expect(state?.messages[99]?.parts[0]).toMatchObject({ text: 'updated latest message' })
    expect(state).toMatchObject({
      historyCursor: 'older-page',
      paginationMode: 'cursor',
      hasMoreHistory: true,
    })
  })

  it('updates a latest snapshot without re-sorting loaded history', () => {
    const history = Array.from({ length: 200 }, (_, index) => {
      const messageNumber = index + 1
      return createMessageWithParts(`message-${messageNumber}`, `message ${messageNumber}`, 'session-1', messageNumber)
    })
    messageStore.setMessages('session-1', history, {
      historyCursor: 'older-page',
      paginationMode: 'cursor',
      hasMoreHistory: true,
    })

    const sortSpy = vi.spyOn(Array.prototype, 'sort')

    messageStore.mergeMessages(
      'session-1',
      [createMessageWithParts('message-200', 'updated latest message', 'session-1', 200)],
      { preserveHistory: true },
    )

    expect(sortSpy).not.toHaveBeenCalled()
    expect(messageStore.getSessionState('session-1')?.messages[199]?.parts[0]).toMatchObject({
      text: 'updated latest message',
    })
  })

  it('clears streaming when a completed latest snapshot replaces a streaming message', () => {
    messageStore.setMessages('session-1', [createIncompleteMessageWithParts('message-1', 'partial')])
    expect(messageStore.getSessionState('session-1')).toMatchObject({ isStreaming: true })
    expect(messageStore.getSessionState('session-1')?.messages[0]?.isStreaming).toBe(true)

    messageStore.mergeMessages('session-1', [createMessageWithParts('message-1', 'complete')], {
      preserveHistory: true,
    })

    const state = messageStore.getSessionState('session-1')
    expect(state?.isStreaming).toBe(false)
    expect(state?.messages[0]?.isStreaming).toBe(false)
  })

  it('keeps an idle session idle when a persisted incomplete snapshot is refreshed', () => {
    messageStore.setMessages('session-1', [createIncompleteMessageWithParts('message-1', 'persisted')], {
      inferStreaming: false,
    })

    messageStore.mergeMessages('session-1', [createIncompleteMessageWithParts('message-1', 'persisted')], {
      preserveHistory: true,
    })

    expect(messageStore.getSessionState('session-1')?.isStreaming).toBe(false)
  })

  it('keeps a local streaming message when a refresh snapshot is older', () => {
    messageStore.setMessages('session-1', [createIncompleteMessageWithParts('message-1', 'live text')])

    messageStore.mergeMessages('session-1', [createMessageWithParts('message-1', 'stale snapshot')], {
      preserveHistory: true,
      preserveStreaming: true,
    })

    const state = messageStore.getSessionState('session-1')
    expect(state?.isStreaming).toBe(true)
    expect(state?.messages[0]?.parts[0]).toMatchObject({ text: 'live text' })
  })

  it('applies a server revert when merging a latest-page snapshot', () => {
    messageStore.setMessages('session-1', [
      createMessageWithParts('message-1', 'one', 'session-1', 1),
      createMessageWithParts('message-2', 'two', 'session-1', 2),
    ])

    messageStore.mergeMessages('session-1', [createMessageWithParts('message-2', 'updated two', 'session-1', 2)], {
      preserveHistory: true,
      revertState: { messageID: 'message-2' },
    })

    expect(messageStore.getSessionState('session-1')?.revertState?.messageId).toBe('message-2')
  })

  it('defers a server revert until its target arrives from older history', () => {
    messageStore.setMessages('session-1', [createMessageWithParts('message-2', 'two', 'session-1', 2)], {
      revertState: { messageID: 'message-1' },
    })

    expect(messageStore.getVisibleMessages('session-1')).toEqual([])
    expect(messageStore.getSessionState('session-1')?.pendingRevertState).toEqual({ messageID: 'message-1' })

    messageStore.prependMessages('session-1', [createMessageWithParts('message-1', 'one', 'session-1', 1)], false)

    expect(messageStore.getSessionState('session-1')).toMatchObject({
      revertState: { messageId: 'message-1' },
      pendingRevertState: undefined,
    })
  })

  it('clears a pending server revert after a complete replacement snapshot omits its target', () => {
    messageStore.setMessages('session-1', [], {
      hasMoreHistory: true,
      revertState: { messageID: 'missing-message' },
    })

    messageStore.setMessages('session-1', [createMessageWithParts('message-1', 'one', 'session-1', 1)], {
      hasMoreHistory: false,
    })

    expect(messageStore.getSessionState('session-1')).toMatchObject({
      revertState: null,
      pendingRevertState: undefined,
      hasMoreHistory: false,
    })
    expect(messageStore.getVisibleMessages('session-1').map(message => message.info.id)).toEqual(['message-1'])
  })

  it('applies a pending server revert when a replacement snapshot contains its target', () => {
    messageStore.setMessages('session-1', [], {
      hasMoreHistory: true,
      revertState: { messageID: 'message-2' },
    })

    messageStore.setMessages('session-1', [
      createMessageWithParts('message-1', 'one', 'session-1', 1),
      createMessageWithParts('message-2', 'two', 'session-1', 2),
    ], {
      hasMoreHistory: false,
    })

    expect(messageStore.getSessionState('session-1')).toMatchObject({
      revertState: { messageId: 'message-2' },
      pendingRevertState: undefined,
    })
    expect(messageStore.getVisibleMessages('session-1').map(message => message.info.id)).toEqual(['message-1'])
  })

  it('keeps messages visible when the final history page does not contain a pending revert target', () => {
    messageStore.setMessages('session-1', [createMessageWithParts('message-2', 'two', 'session-1', 2)], {
      hasMoreHistory: true,
      revertState: { messageID: 'missing-message' },
    })

    expect(messageStore.getVisibleMessages('session-1')).toEqual([])

    messageStore.prependMessages('session-1', [createMessageWithParts('message-1', 'one', 'session-1', 1)], false)

    expect(messageStore.getSessionState('session-1')).toMatchObject({
      revertState: null,
      pendingRevertState: undefined,
      hasMoreHistory: false,
    })
    expect(messageStore.getVisibleMessages('session-1').map(message => message.info.id)).toEqual(['message-1', 'message-2'])
  })

  it('keeps a local revert when a newer message snapshot has no revert metadata', () => {
    messageStore.setMessages('session-1', [
      createMessageWithParts('message-1', 'one', 'session-1', 1),
      createMessageWithParts('message-2', 'two', 'session-1', 2),
    ])
    messageStore.setRevertState('session-1', {
      messageId: 'message-2',
      history: [],
    })

    messageStore.setMessages('session-1', [
      createMessageWithParts('message-1', 'one', 'session-1', 1),
      createMessageWithParts('message-2', 'updated two', 'session-1', 2),
    ])

    expect(messageStore.getSessionState('session-1')?.revertState?.messageId).toBe('message-2')
  })

  it('only records a history error for the current history load', () => {
    const staleGeneration = messageStore.beginHistoryLoad('session-1')
    if (staleGeneration === null) throw new Error('Expected the history load to start')
    messageStore.invalidateHistoryLoad('session-1')

    const error: MessageError = {
      name: 'APIError',
      data: { message: 'stale failure', isRetryable: true },
    }
    expect(messageStore.failHistoryLoad('session-1', staleGeneration, error)).toBe(false)
    expect(messageStore.getSessionState('session-1')?.historyLoadError).toBeUndefined()
  })

  it('flushes mutable part deltas for multiple sessions in the same frame', () => {
    const rafCallbacks: Array<(time: number) => void> = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      rafCallbacks.push(cb as (time: number) => void)
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)

    messageStore.setMessages('session-1', [createMessageWithParts('message-1', 'hello')])
    messageStore.setMessages('session-2', [createMessageWithParts('message-2', 'world', 'session-2')])

    const beforeMessage1 = messageStore.getSessionState('session-1')?.messages[0]
    const beforeMessage2 = messageStore.getSessionState('session-2')?.messages[0]

    messageStore.handlePartDelta({
      sessionID: 'session-1',
      messageID: 'message-1',
      partID: 'part-message-1',
      field: 'text',
      delta: '!',
    })
    messageStore.handlePartDelta({
      sessionID: 'session-2',
      messageID: 'message-2',
      partID: 'part-message-2',
      field: 'text',
      delta: '?',
    })

    const scheduledFrame = rafCallbacks[0]
    if (!scheduledFrame) {
      throw new Error('Expected requestAnimationFrame callback to be scheduled')
    }
    scheduledFrame(0)

    const afterMessage1 = messageStore.getSessionState('session-1')?.messages[0]
    const afterMessage2 = messageStore.getSessionState('session-2')?.messages[0]

    expect(afterMessage1?.parts[0]).toMatchObject({ text: 'hello!' })
    expect(afterMessage2?.parts[0]).toMatchObject({ text: 'world?' })
    expect(afterMessage1).not.toBe(beforeMessage1)
    expect(afterMessage2).not.toBe(beforeMessage2)
  })

  it('notifies only subscribers for changed sessions', () => {
    const session1Subscriber = vi.fn()
    const session2Subscriber = vi.fn()
    const allSubscriber = vi.fn()
    const rafCallbacks: Array<(time: number) => void> = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      rafCallbacks.push(cb as (time: number) => void)
      return rafCallbacks.length
    })

    const unsubscribeSession1 = messageStore.subscribeSession('session-1', session1Subscriber)
    const unsubscribeSession2 = messageStore.subscribeSession('session-2', session2Subscriber)
    const unsubscribeAll = messageStore.subscribe(allSubscriber)

    messageStore.setMessages('session-2', [createMessageWithParts('message-2', 'world', 'session-2')])
    rafCallbacks.shift()?.(0)

    expect(session1Subscriber).not.toHaveBeenCalled()
    expect(session2Subscriber).toHaveBeenCalledTimes(1)
    expect(allSubscriber).toHaveBeenCalledTimes(1)

    unsubscribeSession1()
    unsubscribeSession2()
    unsubscribeAll()
  })
})
