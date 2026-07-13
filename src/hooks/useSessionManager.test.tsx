import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invalidateSessionLoads, useSessionManager } from './useSessionManager'
import { HISTORY_LOAD_BATCH_SIZE, INITIAL_MESSAGE_LIMIT } from '../constants'

const {
  getSessionMock,
  getSessionMessagePageMock,
  getSessionMessagesMock,
  messageStoreMock,
  sessionErrorHandlerMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getSessionMessagePageMock: vi.fn(),
  getSessionMessagesMock: vi.fn(),
  messageStoreMock: {
    getSessionState: vi.fn(),
    setLoadState: vi.fn(),
    setLoadError: vi.fn(),
    setMessages: vi.fn(),
    updateSessionMetadata: vi.fn(),
    prependMessages: vi.fn(),
    beginHistoryLoad: vi.fn(),
    isCurrentHistoryLoad: vi.fn(),
    completeHistoryLoad: vi.fn(),
    failHistoryLoad: vi.fn(),
    invalidateHistoryLoad: vi.fn(),
    mergeMessages: vi.fn(),
    setRevertState: vi.fn(),
  },
  sessionErrorHandlerMock: vi.fn(),
}))

vi.mock('../api', () => ({
  getSession: (...args: unknown[]) => getSessionMock(...args),
  getSessionMessagePage: (...args: unknown[]) => getSessionMessagePageMock(...args),
  getSessionMessages: (...args: unknown[]) => getSessionMessagesMock(...args),
  revertMessage: vi.fn(),
  unrevertSession: vi.fn(),
  extractUserMessageContent: vi.fn(),
}))

vi.mock('../store', () => ({
  messageStore: messageStoreMock,
}))

vi.mock('../utils', () => ({
  sessionErrorHandler: (...args: unknown[]) => sessionErrorHandlerMock(...args),
}))

function createMessage(id: string, created: number) {
  return {
    info: {
      id,
      sessionID: 'session-1',
      role: 'assistant',
      parentID: 'user-1',
      modelID: 'model-1',
      providerID: 'provider-1',
      mode: 'chat',
      agent: 'build',
      path: { cwd: '/workspace/demo', root: '/workspace/demo' },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created },
    },
    parts: [],
  }
}

describe('useSessionManager', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    invalidateSessionLoads()
    getSessionMock.mockReset()
    getSessionMessagePageMock.mockReset()
    getSessionMessagesMock.mockReset()
    messageStoreMock.getSessionState.mockReset()
    messageStoreMock.setLoadState.mockReset()
    messageStoreMock.setLoadError.mockReset()
    messageStoreMock.setMessages.mockReset()
    messageStoreMock.updateSessionMetadata.mockReset()
    messageStoreMock.prependMessages.mockReset()
    messageStoreMock.beginHistoryLoad.mockReset()
    messageStoreMock.isCurrentHistoryLoad.mockReset()
    messageStoreMock.completeHistoryLoad.mockReset()
    messageStoreMock.failHistoryLoad.mockReset()
    messageStoreMock.invalidateHistoryLoad.mockReset()
    messageStoreMock.mergeMessages.mockReset()
    messageStoreMock.setRevertState.mockReset()
    sessionErrorHandlerMock.mockReset()

    messageStoreMock.getSessionState.mockReturnValue(null)
    messageStoreMock.beginHistoryLoad.mockReturnValue(1)
    messageStoreMock.isCurrentHistoryLoad.mockReturnValue(true)
    getSessionMock.mockResolvedValue({ id: 'session-1', directory: '/workspace/demo' })
    getSessionMessagePageMock.mockResolvedValue({ messages: [], nextCursor: undefined })
    getSessionMessagesMock.mockResolvedValue([])
  })

  it('reports missing route sessions when loading returns not found', async () => {
    const onSessionMissing = vi.fn()
    const notFoundError = Object.assign(new Error('session not found'), { status: 404 })
    getSessionMock.mockRejectedValue(notFoundError)
    getSessionMessagePageMock.mockRejectedValue(notFoundError)
    getSessionMessagesMock.mockRejectedValue(notFoundError)

    renderHook(() =>
      useSessionManager({
        sessionId: 'missing-session',
        directory: '/workspace/demo',
        onSessionMissing,
      }),
    )

    await waitFor(() => {
      expect(onSessionMissing).toHaveBeenCalledWith('missing-session')
    })

    expect(messageStoreMock.setLoadState).toHaveBeenCalledWith('missing-session', 'loading')
    expect(messageStoreMock.setLoadError).toHaveBeenCalledWith(
      'missing-session',
      expect.objectContaining({ name: 'APIError' }),
    )
  })

  it('loads persisted messages without inferring a live streaming state', async () => {
    const messages = [
      {
        info: {
          id: 'assistant-1',
          sessionID: 'session-1',
          role: 'assistant',
          parentID: 'user-1',
          modelID: 'model-1',
          providerID: 'provider-1',
          mode: 'chat',
          agent: 'build',
          path: { cwd: '/workspace/demo', root: '/workspace/demo' },
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          time: { created: 1 },
        },
        parts: [],
      },
    ]
    getSessionMessagePageMock.mockResolvedValue({ messages, nextCursor: undefined })
    getSessionMessagesMock.mockResolvedValue(messages)

    renderHook(() =>
      useSessionManager({
        sessionId: 'session-1',
        directory: '/workspace/demo',
      }),
    )

    await waitFor(() => {
      expect(messageStoreMock.setMessages).toHaveBeenCalledWith(
        'session-1',
        messages,
        expect.objectContaining({ inferStreaming: false }),
      )
    })
  })

  it('records cursor pagination from the initial page response', async () => {
    const messages = [createMessage('assistant-1', 1)]
    getSessionMessagePageMock.mockResolvedValue({ messages, nextCursor: 'older-1' })
    getSessionMessagesMock.mockResolvedValue(messages)

    renderHook(() =>
      useSessionManager({
        sessionId: 'session-1',
        directory: '/workspace/demo',
      }),
    )

    await waitFor(() => {
      expect(getSessionMessagePageMock).toHaveBeenCalledWith('session-1', {
        directory: '/workspace/demo',
        limit: INITIAL_MESSAGE_LIMIT,
        signal: expect.any(AbortSignal),
      })
    })

    expect(messageStoreMock.setMessages).toHaveBeenCalledWith(
      'session-1',
      messages,
      expect.objectContaining({
        historyCursor: 'older-1',
        paginationMode: 'cursor',
        hasMoreHistory: true,
      }),
    )
  })

  it('does not wait for session metadata before rendering the initial page', async () => {
    const messages = [createMessage('assistant-1', 1)]
    getSessionMock.mockReturnValue(new Promise(() => {}))
    getSessionMessagePageMock.mockResolvedValue({ messages, nextCursor: undefined })
    getSessionMessagesMock.mockResolvedValue(messages)

    renderHook(() =>
      useSessionManager({
        sessionId: 'session-1',
        directory: '/workspace/demo',
      }),
    )

    await waitFor(() => {
      expect(messageStoreMock.setMessages).toHaveBeenCalledWith('session-1', messages, expect.any(Object))
    })
  })

  it('continues loading cursor pages until the pending revert target arrives', async () => {
    const latest = createMessage('latest', 3)
    const middle = createMessage('middle', 2)
    const revertTarget = createMessage('revert-target', 1)
    let state = {
      messages: [] as ReturnType<typeof createMessage>[],
      isStreaming: false,
      isStale: false,
      loadState: 'idle' as const,
      directory: '/workspace/demo',
      hasMoreHistory: false,
      historyCursor: undefined as string | undefined,
      paginationMode: 'unknown' as 'unknown' | 'cursor' | 'legacy',
      pendingRevertState: undefined as { messageID: string } | undefined,
      revertState: null as { messageId: string } | null,
      localRevertGeneration: 0,
      isLoadingHistory: false,
    }
    messageStoreMock.getSessionState.mockImplementation(() => state)
    getSessionMock.mockResolvedValue({
      id: 'session-1',
      directory: '/workspace/demo',
      revert: { messageID: 'revert-target' },
    })
    getSessionMessagePageMock
      .mockResolvedValueOnce({ messages: [latest], nextCursor: 'cursor-1' })
      .mockResolvedValueOnce({ messages: [middle], nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({ messages: [revertTarget], nextCursor: undefined })
    messageStoreMock.setMessages.mockImplementation(
      (_sessionId: string, messages: ReturnType<typeof createMessage>[], options: {
        hasMoreHistory: boolean
        historyCursor: string | undefined
        paginationMode: 'cursor' | 'legacy'
        revertState?: { messageID: string } | null
      }) => {
        state = {
          ...state,
          messages,
          hasMoreHistory: options.hasMoreHistory,
          historyCursor: options.historyCursor,
          paginationMode: options.paginationMode,
          pendingRevertState: options.revertState ?? undefined,
        }
      },
    )
    let nextHistoryGeneration = 0
    messageStoreMock.beginHistoryLoad.mockImplementation(() => {
      state.isLoadingHistory = true
      nextHistoryGeneration += 1
      return nextHistoryGeneration
    })
    messageStoreMock.prependMessages.mockImplementation((_sessionId: string, messages: ReturnType<typeof createMessage>[]) => {
      state.messages = [...messages, ...state.messages]
      if (messages.some(message => message.info.id === 'revert-target')) {
        state.pendingRevertState = undefined
      }
    })
    messageStoreMock.completeHistoryLoad.mockImplementation(
      (_sessionId: string, _generation: number, options: {
        historyCursor: string | undefined
        paginationMode: 'cursor' | 'legacy'
        hasMoreHistory: boolean
      }) => {
        state.historyCursor = options.historyCursor
        state.paginationMode = options.paginationMode
        state.hasMoreHistory = options.hasMoreHistory
        state.isLoadingHistory = false
        return true
      },
    )

    renderHook(() =>
      useSessionManager({
        sessionId: 'session-1',
        directory: '/workspace/demo',
      }),
    )

    await waitFor(() => {
      expect(getSessionMessagePageMock).toHaveBeenCalledTimes(3)
    })
    expect(getSessionMessagePageMock).toHaveBeenLastCalledWith('session-1', {
      directory: '/workspace/demo',
      limit: HISTORY_LOAD_BATCH_SIZE,
      before: 'cursor-2',
      signal: expect.any(AbortSignal),
    })
  })

  it('uses the server cursor and a fixed batch size when loading older history', async () => {
    const latest = createMessage('latest', 2)
    const older = createMessage('older', 1)
    const state = {
      messages: [latest],
      isStreaming: false,
      isStale: false,
      loadState: 'loaded',
      directory: '/workspace/demo',
      hasMoreHistory: true,
      historyCursor: 'older-1',
      paginationMode: 'cursor',
    }
    messageStoreMock.getSessionState.mockReturnValue(state)
    getSessionMessagePageMock.mockResolvedValue({ messages: [older, latest], nextCursor: 'older-2' })

    const { result } = renderHook(() =>
      useSessionManager({
        sessionId: 'session-1',
        directory: '/workspace/demo',
      }),
    )

    await act(async () => {
      await result.current.loadMoreHistory()
    })

    expect(getSessionMessagePageMock).toHaveBeenCalledWith('session-1', {
      directory: '/workspace/demo',
      limit: HISTORY_LOAD_BATCH_SIZE,
      before: 'older-1',
      signal: expect.any(AbortSignal),
    })
    expect(messageStoreMock.prependMessages).toHaveBeenCalledWith('session-1', [older], true)
    expect(messageStoreMock.completeHistoryLoad).toHaveBeenCalledWith('session-1', 1, {
      historyCursor: 'older-2',
      paginationMode: 'cursor',
      hasMoreHistory: true,
    })
  })

  it('stops cursor pagination when the final batch has no next cursor', async () => {
    const state = {
      messages: [createMessage('latest', HISTORY_LOAD_BATCH_SIZE + 1)],
      isStreaming: false,
      isStale: false,
      loadState: 'loaded',
      directory: '/workspace/demo',
      hasMoreHistory: true,
      historyCursor: 'older-1',
      paginationMode: 'cursor',
    }
    const finalPage = Array.from({ length: HISTORY_LOAD_BATCH_SIZE }, (_, index) => createMessage(`older-${index}`, index))
    messageStoreMock.getSessionState.mockReturnValue(state)
    getSessionMessagePageMock.mockResolvedValue({ messages: finalPage, nextCursor: undefined })

    const { result } = renderHook(() =>
      useSessionManager({
        sessionId: 'session-1',
        directory: '/workspace/demo',
      }),
    )

    await act(async () => {
      await result.current.loadMoreHistory()
    })

    expect(messageStoreMock.completeHistoryLoad).toHaveBeenCalledWith('session-1', 1, {
      historyCursor: undefined,
      paginationMode: 'cursor',
      hasMoreHistory: false,
    })
  })

  it('uses the cumulative legacy limit only when the server did not provide a cursor', async () => {
    const messages = Array.from({ length: INITIAL_MESSAGE_LIMIT }, (_, index) => createMessage(`message-${index}`, index))
    const legacyLimit = INITIAL_MESSAGE_LIMIT + HISTORY_LOAD_BATCH_SIZE
    const pageMessages = Array.from({ length: legacyLimit }, (_, index) => createMessage(`page-${index}`, index))
    const state = {
      messages,
      isStreaming: false,
      isStale: false,
      loadState: 'loaded',
      directory: '/workspace/demo',
      hasMoreHistory: true,
      historyCursor: undefined,
      paginationMode: 'legacy',
    }
    messageStoreMock.getSessionState.mockReturnValue(state)
    getSessionMessagePageMock.mockResolvedValue({ messages: pageMessages, nextCursor: undefined })

    const { result } = renderHook(() =>
      useSessionManager({
        sessionId: 'session-1',
        directory: '/workspace/demo',
      }),
    )

    await act(async () => {
      await result.current.loadMoreHistory()
    })

    expect(getSessionMessagePageMock).toHaveBeenCalledWith('session-1', {
      directory: '/workspace/demo',
      limit: legacyLimit,
      signal: expect.any(AbortSignal),
    })
    expect(messageStoreMock.completeHistoryLoad).toHaveBeenCalledWith('session-1', 1, {
      historyCursor: undefined,
      paginationMode: 'legacy',
      hasMoreHistory: true,
    })
  })

  it('rejects a second history load while the first request is in flight', async () => {
    const state = {
      messages: [createMessage('latest', 2)],
      isStreaming: false,
      isStale: false,
      loadState: 'loaded',
      directory: '/workspace/demo',
      hasMoreHistory: true,
      historyCursor: 'older-1',
      paginationMode: 'cursor',
    }
    let resolvePage: (value: { messages: ReturnType<typeof createMessage>[]; nextCursor: string | undefined }) => void
    const pagePromise = new Promise<{ messages: ReturnType<typeof createMessage>[]; nextCursor: string | undefined }>(resolve => {
      resolvePage = resolve
    })
    messageStoreMock.getSessionState.mockReturnValue(state)
    messageStoreMock.beginHistoryLoad.mockReturnValueOnce(1).mockReturnValueOnce(null)
    getSessionMessagePageMock.mockReturnValue(pagePromise)

    const { result } = renderHook(() =>
      useSessionManager({
        sessionId: 'session-1',
        directory: '/workspace/demo',
      }),
    )

    const firstLoad = result.current.loadMoreHistory()
    const secondLoad = result.current.loadMoreHistory()

    expect(getSessionMessagePageMock).toHaveBeenCalledTimes(1)

    resolvePage!({ messages: [createMessage('older', 1)], nextCursor: undefined })
    await act(async () => {
      await Promise.all([firstLoad, secondLoad])
    })
  })

  it('ignores a stale history page response', async () => {
    const state = {
      messages: [createMessage('latest', 2)],
      isStreaming: false,
      isStale: false,
      loadState: 'loaded',
      directory: '/workspace/demo',
      hasMoreHistory: true,
      historyCursor: 'older-1',
      paginationMode: 'cursor',
    }
    messageStoreMock.getSessionState.mockReturnValue(state)
    messageStoreMock.isCurrentHistoryLoad.mockReturnValue(false)
    getSessionMessagePageMock.mockResolvedValue({ messages: [createMessage('older', 1)], nextCursor: undefined })

    const { result } = renderHook(() =>
      useSessionManager({
        sessionId: 'session-1',
        directory: '/workspace/demo',
      }),
    )

    await act(async () => {
      await result.current.loadMoreHistory()
    })

    expect(messageStoreMock.prependMessages).not.toHaveBeenCalled()
    expect(messageStoreMock.completeHistoryLoad).not.toHaveBeenCalled()
  })

  it('records history load failures for the active generation', async () => {
    const state = {
      messages: [createMessage('latest', 2)],
      isStreaming: false,
      isStale: false,
      loadState: 'loaded',
      directory: '/workspace/demo',
      hasMoreHistory: true,
      historyCursor: 'older-1',
      paginationMode: 'cursor',
    }
    const error = new Error('Could not load older messages')
    messageStoreMock.getSessionState.mockReturnValue(state)
    getSessionMessagePageMock.mockRejectedValue(error)

    const { result } = renderHook(() =>
      useSessionManager({
        sessionId: 'session-1',
        directory: '/workspace/demo',
      }),
    )

    await act(async () => {
      await result.current.loadMoreHistory()
    })

    expect(messageStoreMock.failHistoryLoad).toHaveBeenCalledWith(
      'session-1',
      1,
      expect.objectContaining({ name: 'APIError' }),
    )
  })

  it('aborts a timed-out history load and releases it for retry', async () => {
    vi.useFakeTimers()
    const state = {
      messages: [createMessage('latest', 2)],
      isStreaming: false,
      isStale: false,
      loadState: 'loaded',
      directory: '/workspace/demo',
      hasMoreHistory: true,
      historyCursor: 'older-1',
      paginationMode: 'cursor',
    }
    let isLoading = false
    let currentGeneration = 0
    let historySignal: AbortSignal | undefined
    messageStoreMock.getSessionState.mockReturnValue(state)
    messageStoreMock.beginHistoryLoad.mockImplementation(() => {
      if (isLoading) return null
      isLoading = true
      currentGeneration += 1
      return currentGeneration
    })
    messageStoreMock.isCurrentHistoryLoad.mockImplementation(
      (_sessionId: string, generation: number) => isLoading && generation === currentGeneration,
    )
    messageStoreMock.failHistoryLoad.mockImplementation((_sessionId: string, generation: number) => {
      if (!isLoading || generation !== currentGeneration) return false
      isLoading = false
      return true
    })
    messageStoreMock.completeHistoryLoad.mockImplementation((_sessionId: string, generation: number) => {
      if (!isLoading || generation !== currentGeneration) return false
      isLoading = false
      return true
    })
    getSessionMessagePageMock
      .mockImplementationOnce(
        (_sessionId: string, options: { signal?: AbortSignal }) =>
          new Promise((_, reject) => {
            historySignal = options.signal
            options.signal?.addEventListener('abort', () => reject(new Error('History page timed out')), { once: true })
          }),
      )
      .mockResolvedValueOnce({ messages: [createMessage('older', 1)], nextCursor: undefined })

    const { result } = renderHook(() =>
      useSessionManager({
        sessionId: 'session-1',
        directory: '/workspace/demo',
      }),
    )

    void result.current.loadMoreHistory()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(historySignal).toBeInstanceOf(AbortSignal)
    expect(historySignal?.aborted).toBe(true)
    expect(messageStoreMock.failHistoryLoad).toHaveBeenCalledWith(
      'session-1',
      1,
      expect.objectContaining({ name: 'APIError' }),
    )

    await act(async () => {
      await result.current.loadMoreHistory()
    })

    expect(messageStoreMock.beginHistoryLoad).toHaveBeenCalledTimes(2)
    expect(messageStoreMock.completeHistoryLoad).toHaveBeenCalledWith('session-1', 2, {
      historyCursor: undefined,
      paginationMode: 'cursor',
      hasMoreHistory: false,
    })
  })

  it('merges a force refresh into loaded history instead of replacing it', async () => {
    const history = Array.from({ length: 100 }, (_, index) => createMessage(`message-${index}`, index))
    const latestPage = history.slice(-INITIAL_MESSAGE_LIMIT)
    const state = {
      messages: history,
      isStreaming: false,
      isStale: false,
      loadState: 'loaded',
      directory: '/workspace/demo',
      hasMoreHistory: true,
      historyCursor: 'older-100',
      paginationMode: 'cursor',
    }
    messageStoreMock.getSessionState.mockReturnValue(state)
    getSessionMessagePageMock.mockResolvedValue({ messages: latestPage, nextCursor: 'older-50' })
    getSessionMessagesMock.mockResolvedValue(latestPage)

    const { result } = renderHook(() =>
      useSessionManager({
        sessionId: null,
        directory: '/workspace/demo',
      }),
    )

    await act(async () => {
      await result.current.loadSession('session-1', { force: true })
    })

    expect(messageStoreMock.mergeMessages).toHaveBeenCalledWith(
      'session-1',
      latestPage,
      expect.objectContaining({ preserveHistory: true }),
    )
    expect(messageStoreMock.setMessages).not.toHaveBeenCalled()
  })

  it('preserves local streaming data when a force refresh receives an older snapshot', async () => {
    const liveMessage = createMessage('assistant-1', 1)
    const state = {
      messages: [liveMessage],
      isStreaming: true,
      isStale: false,
      loadState: 'loaded',
      directory: '/workspace/demo',
      hasMoreHistory: true,
      historyCursor: 'older-1',
      paginationMode: 'cursor',
    }
    messageStoreMock.getSessionState.mockReturnValue(state)
    getSessionMessagePageMock.mockResolvedValue({ messages: [liveMessage], nextCursor: 'older-1' })

    const { result } = renderHook(() =>
      useSessionManager({
        sessionId: null,
        directory: '/workspace/demo',
      }),
    )

    await act(async () => {
      await result.current.loadSession('session-1', { force: true })
    })

    expect(messageStoreMock.mergeMessages).toHaveBeenCalledWith(
      'session-1',
      [liveMessage],
      expect.objectContaining({ preserveHistory: true, preserveStreaming: true }),
    )
  })

  it('applies a delayed server revert after the initial message page loads', async () => {
    let resolveSession!: (session: { id: string; directory: string; revert: { messageID: string } }) => void
    const sessionPromise = new Promise<{ id: string; directory: string; revert: { messageID: string } }>(resolve => {
      resolveSession = resolve
    })
    const messages = [createMessage('message-1', 1)]
    const state = { messages: [], revertState: null as { messageId: string } | null, localRevertGeneration: 0 }
    messageStoreMock.getSessionState.mockReturnValue(state)
    getSessionMock.mockReturnValue(sessionPromise)
    getSessionMessagePageMock.mockResolvedValue({ messages, nextCursor: undefined })

    renderHook(() =>
      useSessionManager({
        sessionId: 'session-1',
        directory: '/workspace/demo',
      }),
    )

    await waitFor(() => expect(messageStoreMock.setMessages).toHaveBeenCalled())

    await act(async () => {
      resolveSession({ id: 'session-1', directory: '/workspace/demo', revert: { messageID: 'message-1' } })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(messageStoreMock.updateSessionMetadata).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({ revertState: { messageID: 'message-1' } }),
      )
    })
  })

  it('does not overwrite a local revert when delayed metadata arrives', async () => {
    let resolveSession!: (session: { id: string; directory: string; revert: null }) => void
    const sessionPromise = new Promise<{ id: string; directory: string; revert: null }>(resolve => {
      resolveSession = resolve
    })
    const state = { messages: [], revertState: null as { messageId: string } | null, localRevertGeneration: 0 }
    messageStoreMock.getSessionState.mockReturnValue(state)
    getSessionMock.mockReturnValue(sessionPromise)
    getSessionMessagePageMock.mockResolvedValue({ messages: [createMessage('message-1', 1)], nextCursor: undefined })

    renderHook(() =>
      useSessionManager({
        sessionId: 'session-1',
        directory: '/workspace/demo',
      }),
    )

    await waitFor(() => expect(messageStoreMock.setMessages).toHaveBeenCalled())
    state.revertState = { messageId: 'local-revert' }
    state.localRevertGeneration = 1

    await act(async () => {
      resolveSession({ id: 'session-1', directory: '/workspace/demo', revert: null })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(messageStoreMock.updateSessionMetadata).toHaveBeenCalledWith(
        'session-1',
        expect.not.objectContaining({ revertState: null }),
      )
    })
  })

  it('does not apply old session metadata after a local revert changes during the initial page request', async () => {
    let resolveSession!: (session: { id: string; directory: string; revert: null }) => void
    let resolvePage!: (page: { messages: ReturnType<typeof createMessage>[]; nextCursor: undefined }) => void
    const sessionPromise = new Promise<{ id: string; directory: string; revert: null }>(resolve => {
      resolveSession = resolve
    })
    const pagePromise = new Promise<{ messages: ReturnType<typeof createMessage>[]; nextCursor: undefined }>(resolve => {
      resolvePage = resolve
    })
    const state = {
      messages: [createMessage('existing', 1)],
      isStreaming: false,
      isStale: false,
      loadState: 'loaded',
      directory: '/workspace/demo',
      hasMoreHistory: true,
      historyCursor: 'older-1',
      paginationMode: 'cursor',
      revertState: null as { messageId: string } | null,
      localRevertGeneration: 0,
    }
    messageStoreMock.getSessionState.mockReturnValue(state)
    getSessionMock.mockReturnValue(sessionPromise)
    getSessionMessagePageMock.mockReturnValue(pagePromise)

    const { result } = renderHook(() =>
      useSessionManager({
        sessionId: null,
        directory: '/workspace/demo',
      }),
    )
    const load = result.current.loadSession('session-1')

    state.revertState = { messageId: 'local-revert' }
    state.localRevertGeneration = 1
    resolvePage({ messages: [createMessage('message-1', 1)], nextCursor: undefined })
    await act(async () => {
      await load
    })

    expect(messageStoreMock.setMessages).toHaveBeenCalledWith(
      'session-1',
      [createMessage('message-1', 1)],
      expect.not.objectContaining({ revertState: null }),
    )

    resolveSession({ id: 'session-1', directory: '/workspace/demo', revert: null })
    await act(async () => {
      await Promise.resolve()
    })

    expect(messageStoreMock.updateSessionMetadata).not.toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ revertState: null }),
    )
  })

  it('keeps an active history load valid while refreshing a loaded streaming session', async () => {
    const state = {
      messages: [createMessage('assistant-1', 1)],
      isStreaming: true,
      isStale: false,
      loadState: 'loaded',
      directory: '/workspace/demo',
      hasMoreHistory: true,
      historyCursor: 'older-1',
      paginationMode: 'cursor',
      revertState: null,
      localRevertGeneration: 0,
    }
    messageStoreMock.getSessionState.mockReturnValue(state)

    const { result } = renderHook(() =>
      useSessionManager({
        sessionId: null,
        directory: '/workspace/demo',
      }),
    )

    await act(async () => {
      await result.current.loadSession('session-1')
    })

    expect(messageStoreMock.invalidateHistoryLoad).not.toHaveBeenCalled()
  })

  it('does not restart an active history load for a force refresh with cached messages', async () => {
    const state = {
      messages: [createMessage('assistant-1', 1)],
      isStreaming: false,
      isStale: false,
      loadState: 'loaded',
      directory: '/workspace/demo',
      hasMoreHistory: true,
      historyCursor: 'older-1',
      paginationMode: 'cursor',
      isLoadingHistory: true,
      revertState: null,
      localRevertGeneration: 0,
    }
    messageStoreMock.getSessionState.mockReturnValue(state)
    getSessionMessagePageMock.mockResolvedValue({ messages: [createMessage('assistant-1', 1)], nextCursor: 'older-1' })

    const { result } = renderHook(() =>
      useSessionManager({
        sessionId: null,
        directory: '/workspace/demo',
      }),
    )

    await act(async () => {
      await result.current.loadSession('session-1', { force: true })
    })

    expect(messageStoreMock.setLoadState).not.toHaveBeenCalledWith('session-1', 'loading')
  })

  it('merges a stale cached reload into previously loaded history without resetting pagination', async () => {
    const history = Array.from({ length: 100 }, (_, index) => createMessage(`message-${index}`, index))
    const latestPage = history.slice(-INITIAL_MESSAGE_LIMIT)
    const state = {
      messages: history,
      isStreaming: false,
      isStale: true,
      loadState: 'loaded',
      directory: '/workspace/demo',
      hasMoreHistory: true,
      historyCursor: 'older-100',
      paginationMode: 'cursor',
    }
    messageStoreMock.getSessionState.mockReturnValue(state)
    getSessionMessagePageMock.mockResolvedValue({ messages: latestPage, nextCursor: 'older-50' })

    const { result } = renderHook(() =>
      useSessionManager({
        sessionId: null,
        directory: '/workspace/demo',
      }),
    )

    await act(async () => {
      await result.current.loadSession('session-1')
    })

    expect(messageStoreMock.mergeMessages).toHaveBeenCalledWith(
      'session-1',
      latestPage,
      expect.objectContaining({ preserveHistory: true }),
    )
    expect(messageStoreMock.setMessages).not.toHaveBeenCalled()
  })

  it('ignores an older pane load when another pane force-refreshes the same session', async () => {
    type MessagePage = { messages: ReturnType<typeof createMessage>[]; nextCursor: string | undefined }
    let resolveOlderPage!: (page: MessagePage) => void
    let resolveNewerPage!: (page: MessagePage) => void
    const olderPage = new Promise<MessagePage>(resolve => {
      resolveOlderPage = resolve
    })
    const newerPage = new Promise<MessagePage>(resolve => {
      resolveNewerPage = resolve
    })
    const oldMessage = createMessage('old-message', 1)
    const newMessage = createMessage('new-message', 2)
    getSessionMessagePageMock.mockReturnValueOnce(olderPage).mockReturnValueOnce(newerPage)

    const { result: firstPane } = renderHook(() =>
      useSessionManager({
        sessionId: null,
        directory: '/workspace/demo',
      }),
    )
    const { result: secondPane } = renderHook(() =>
      useSessionManager({
        sessionId: null,
        directory: '/workspace/demo',
      }),
    )

    const olderLoad = firstPane.current.loadSession('session-1')
    const newerLoad = secondPane.current.loadSession('session-1', { force: true })

    await act(async () => {
      resolveNewerPage({ messages: [newMessage], nextCursor: undefined })
      await newerLoad
    })

    expect(messageStoreMock.setMessages).toHaveBeenCalledTimes(1)
    expect(messageStoreMock.setMessages).toHaveBeenCalledWith('session-1', [newMessage], expect.any(Object))

    await act(async () => {
      resolveOlderPage({ messages: [oldMessage], nextCursor: undefined })
      await olderLoad
    })

    expect(messageStoreMock.setMessages).toHaveBeenCalledTimes(1)
    expect(messageStoreMock.mergeMessages).not.toHaveBeenCalled()
  })

  it('ignores a response that completes after session loads are invalidated', async () => {
    type MessagePage = { messages: ReturnType<typeof createMessage>[]; nextCursor: string | undefined }
    let resolvePage!: (page: MessagePage) => void
    const page = new Promise<MessagePage>(resolve => {
      resolvePage = resolve
    })
    getSessionMessagePageMock.mockReturnValue(page)

    const { result } = renderHook(() =>
      useSessionManager({
        sessionId: null,
        directory: '/workspace/demo',
      }),
    )

    const load = result.current.loadSession('session-1')
    invalidateSessionLoads()

    await act(async () => {
      resolvePage({ messages: [createMessage('old-server-message', 1)], nextCursor: undefined })
      await load
    })

    expect(messageStoreMock.setMessages).not.toHaveBeenCalled()
    expect(messageStoreMock.setLoadError).not.toHaveBeenCalled()
  })

  it('sets the session load error when the initial page times out', async () => {
    vi.useFakeTimers()
    getSessionMessagePageMock.mockImplementation(
      (_sessionId: string, options: { signal?: AbortSignal }) =>
        new Promise((_, reject) => {
          options.signal?.addEventListener('abort', () => reject(new Error('Initial page timed out')), { once: true })
        }),
    )

    renderHook(() =>
      useSessionManager({
        sessionId: 'session-1',
        directory: '/workspace/demo',
      }),
    )

    expect(getSessionMessagePageMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(messageStoreMock.setLoadError).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ name: 'APIError' }),
    )
  })

  it('preserves an existing live streaming state during baseline load', async () => {
    const messages = [
      {
        info: {
          id: 'assistant-1',
          sessionID: 'session-1',
          role: 'assistant',
          parentID: 'user-1',
          modelID: 'model-1',
          providerID: 'provider-1',
          mode: 'chat',
          agent: 'build',
          path: { cwd: '/workspace/demo', root: '/workspace/demo' },
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          time: { created: 1 },
        },
        parts: [],
      },
    ]
    messageStoreMock.getSessionState.mockReturnValue({
      isStreaming: true,
      isStale: false,
      loadState: 'loading',
      messages: [
        {
          info: messages[0].info,
          parts: [],
          isStreaming: true,
        },
      ],
    })
    getSessionMessagePageMock.mockResolvedValue({ messages, nextCursor: undefined })
    getSessionMessagesMock.mockResolvedValue(messages)

    renderHook(() =>
      useSessionManager({
        sessionId: 'session-1',
        directory: '/workspace/demo',
      }),
    )

    await waitFor(() => {
      expect(messageStoreMock.setMessages).toHaveBeenCalledWith(
        'session-1',
        messages,
        expect.objectContaining({ inferStreaming: true }),
      )
    })
  })
})
