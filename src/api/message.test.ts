import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSessionMessagePage, getSessionMessages } from './message'

const messagesMock = vi.fn()
const unwrapMock = vi.fn((result: { data?: unknown }) => result.data)
const formatPathForApiMock = vi.fn((directory: string | undefined) =>
  directory ? `formatted:${directory}` : undefined,
)

vi.mock('./sdk', () => ({
  getSDKClient: () => ({
    session: {
      messages: (...args: unknown[]) => messagesMock(...args),
    },
  }),
  unwrap: (result: { data?: unknown }) => unwrapMock(result),
}))

vi.mock('../utils/directoryUtils', () => ({
  formatPathForApi: (directory: string | undefined) => formatPathForApiMock(directory),
}))

describe('session message queries', () => {
  beforeEach(() => {
    messagesMock.mockReset()
    unwrapMock.mockClear()
    formatPathForApiMock.mockClear()
  })

  it('forwards before with a formatted directory and positive limit', async () => {
    messagesMock.mockResolvedValue({ data: [], response: new Response() })

    await getSessionMessagePage('session-1', {
      directory: '/workspace/project/',
      limit: 50,
      before: 'message-10',
    })

    expect(messagesMock).toHaveBeenCalledWith({
      sessionID: 'session-1',
      directory: 'formatted:/workspace/project/',
      limit: 50,
      before: 'message-10',
    })
  })

  it('forwards an optional abort signal through the SDK request options', async () => {
    const controller = new AbortController()
    messagesMock.mockResolvedValue({ data: [], response: new Response() })

    await getSessionMessagePage('session-1', {
      limit: 50,
      signal: controller.signal,
    })

    expect(messagesMock).toHaveBeenCalledWith(
      {
        sessionID: 'session-1',
        directory: undefined,
        limit: 50,
        before: undefined,
      },
      { signal: controller.signal },
    )
  })

  it('returns the next cursor from the SDK response headers', async () => {
    const messages = [{ id: 'message-1' }]
    const result = {
      data: messages,
      response: new Response(null, { headers: { 'X-Next-Cursor': 'cursor-2' } }),
    }
    messagesMock.mockResolvedValue(result)

    await expect(getSessionMessagePage('session-1', { limit: 50 })).resolves.toEqual({
      messages,
      nextCursor: 'cursor-2',
    })
    expect(unwrapMock).toHaveBeenCalledWith(result)
  })

  it('returns undefined when the SDK response has no next cursor header', async () => {
    messagesMock.mockResolvedValue({ data: [], response: new Response() })

    await expect(getSessionMessagePage('session-1', { limit: 50 })).resolves.toEqual({
      messages: [],
      nextCursor: undefined,
    })
  })

  it('keeps getSessionMessages compatible with its existing arguments and result', async () => {
    const messages = [{ id: 'message-1' }]
    messagesMock.mockResolvedValue({ data: messages })

    await expect(getSessionMessages('session-1', 25, '/workspace/project/')).resolves.toBe(messages)
    expect(messagesMock).toHaveBeenCalledWith({
      sessionID: 'session-1',
      directory: 'formatted:/workspace/project/',
      limit: 25,
    })
  })
})
