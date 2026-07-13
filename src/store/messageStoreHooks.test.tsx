import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiMessage, ApiMessageWithParts, ApiPart } from '../api/types'
import type { MessageError } from '../types/message'
import { messageStore } from './messageStore'
import { useSessionState } from './messageStoreHooks'

vi.mock('./paneLayoutStore', () => ({
  paneLayoutStore: {
    getFocusedSessionId: vi.fn(() => 'session-1'),
    subscribe: vi.fn(() => vi.fn()),
  },
}))

function createUserMessage(id: string, created: number): ApiMessage {
  return {
    id,
    sessionID: 'session-1',
    role: 'user',
    time: { created },
    agent: 'build',
    model: { providerID: 'provider-1', modelID: 'model-1' },
  }
}

function createTextPart(
  id: string,
  messageID: string,
  text: string,
): ApiPart & { sessionID: string; messageID: string } {
  return {
    id,
    sessionID: 'session-1',
    messageID,
    type: 'text',
    text,
  }
}

function createMessageWithParts(id: string, text: string, created: number): ApiMessageWithParts {
  return {
    info: createUserMessage(id, created),
    parts: [createTextPart(`part-${id}`, id, text)],
  }
}

describe('useSessionState', () => {
  beforeEach(() => {
    messageStore.clearAll()
  })

  it('returns only visible messages after revert', () => {
    messageStore.setMessages('session-1', [
      createMessageWithParts('message-1', 'one', 1),
      createMessageWithParts('message-2', 'two', 2),
      createMessageWithParts('message-3', 'three', 3),
    ])
    messageStore.setRevertState('session-1', {
      messageId: 'message-2',
      history: [],
    })

    const { result } = renderHook(() => useSessionState('session-1'))

    expect(result.current?.messages.map(message => message.info.id)).toEqual(['message-1'])
    expect(result.current?.canUndo).toBe(true)
  })

  it('disables undo when no visible user messages remain', () => {
    messageStore.setMessages('session-1', [createMessageWithParts('message-1', 'one', 1)])
    messageStore.setRevertState('session-1', {
      messageId: 'message-1',
      history: [],
    })

    const { result } = renderHook(() => useSessionState('session-1'))

    expect(result.current?.messages).toEqual([])
    expect(result.current?.canUndo).toBe(false)
  })

  it('does not re-render when another session changes', async () => {
    messageStore.setMessages('session-1', [createMessageWithParts('message-1', 'one', 1)])
    messageStore.setMessages('session-2', [
      {
        info: { ...createUserMessage('message-2', 2), sessionID: 'session-2' },
        parts: [{ ...createTextPart('part-message-2', 'message-2', 'two'), sessionID: 'session-2' }],
      },
    ])

    let renderCount = 0
    const { result } = renderHook(() => {
      renderCount += 1
      return useSessionState('session-1')
    })
    expect(result.current?.messages.map(message => message.info.id)).toEqual(['message-1'])

    messageStore.handlePartUpdated({
      ...createTextPart('part-message-2', 'message-2', 'two updated'),
      sessionID: 'session-2',
    })
    await new Promise(resolve => requestAnimationFrame(resolve))

    expect(renderCount).toBe(1)
    expect(result.current?.messages.map(message => message.info.id)).toEqual(['message-1'])
  })

  it('updates a subscribed session snapshot for history loading and errors', async () => {
    messageStore.setMessages('session-1', [createMessageWithParts('message-1', 'one', 1)])
    const { result } = renderHook(() => useSessionState('session-1'))
    expect(result.current).toMatchObject({
      isLoadingHistory: false,
      historyLoadError: undefined,
    })

    let generation: number | null = null
    await act(async () => {
      generation = messageStore.beginHistoryLoad('session-1')
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    })
    const currentGeneration = generation
    if (currentGeneration === null) throw new Error('Expected the history load to start')
    expect(result.current).toMatchObject({
      isLoadingHistory: true,
      historyLoadError: undefined,
    })

    const error: MessageError = {
      name: 'APIError',
      data: { message: 'Could not load older messages', isRetryable: true },
    }
    await act(async () => {
      messageStore.failHistoryLoad('session-1', currentGeneration, error)
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    })

    expect(result.current).toMatchObject({
      isLoadingHistory: false,
      historyLoadError: error,
    })
  })

  it('exposes the history pagination mode for compatibility UI', () => {
    messageStore.setMessages('session-1', [createMessageWithParts('message-1', 'one', 1)], {
      paginationMode: 'legacy',
      hasMoreHistory: true,
    })

    const { result } = renderHook(() => useSessionState('session-1'))

    expect(result.current?.historyPaginationMode).toBe('legacy')
  })
})
