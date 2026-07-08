import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionManager } from './useSessionManager'

const {
  getSessionMock,
  getSessionMessagesMock,
  messageStoreMock,
  sessionErrorHandlerMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getSessionMessagesMock: vi.fn(),
  messageStoreMock: {
    getSessionState: vi.fn(),
    setLoadState: vi.fn(),
    setLoadError: vi.fn(),
    setMessages: vi.fn(),
    updateSessionMetadata: vi.fn(),
    prependMessages: vi.fn(),
    setRevertState: vi.fn(),
  },
  sessionErrorHandlerMock: vi.fn(),
}))

vi.mock('../api', () => ({
  getSession: (...args: unknown[]) => getSessionMock(...args),
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

describe('useSessionManager', () => {
  beforeEach(() => {
    getSessionMock.mockReset()
    getSessionMessagesMock.mockReset()
    messageStoreMock.getSessionState.mockReset()
    messageStoreMock.setLoadState.mockReset()
    messageStoreMock.setLoadError.mockReset()
    messageStoreMock.setMessages.mockReset()
    messageStoreMock.updateSessionMetadata.mockReset()
    messageStoreMock.prependMessages.mockReset()
    messageStoreMock.setRevertState.mockReset()
    sessionErrorHandlerMock.mockReset()

    messageStoreMock.getSessionState.mockReturnValue(null)
    getSessionMock.mockResolvedValue({ id: 'session-1', directory: '/workspace/demo' })
    getSessionMessagesMock.mockResolvedValue([])
  })

  it('reports missing route sessions when loading returns not found', async () => {
    const onSessionMissing = vi.fn()
    const notFoundError = Object.assign(new Error('session not found'), { status: 404 })
    getSessionMock.mockRejectedValue(notFoundError)
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
