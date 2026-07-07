import { describe, expect, it } from 'vitest'
import { getWorkingStatus } from './workingStatus'
import type { Message } from '../../types/message'
import type { SessionStatus } from '../../types/api/session'

function assistant(parts: Message['parts'], overrides: Partial<Message['info']> = {}): Message {
  return {
    info: {
      id: 'assistant-1',
      role: 'assistant',
      sessionID: 'session-1',
      parentID: 'user-1',
      modelID: 'claude-sonnet-4',
      providerID: 'anthropic',
      mode: 'build',
      agent: 'build',
      path: { cwd: '/', root: '/' },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: 1 },
      ...overrides,
    } as Message['info'],
    parts,
    isStreaming: true,
  }
}

describe('getWorkingStatus', () => {
  it('uses concrete running tool names instead of generic status text', () => {
    const status = getWorkingStatus({
      isStreaming: true,
      messages: [
        assistant([
          {
            id: 'tool-1',
            type: 'tool',
            sessionID: 'session-1',
            messageID: 'assistant-1',
            callID: 'call-1',
            tool: 'bash',
            state: { status: 'running', input: {}, title: 'npm run test:run', time: { start: 1 } },
          },
        ]),
      ],
    })

    expect(status?.detail).toBe('Running Bash: npm run test:run')
  })

  it('omits details when only generic streaming state is available', () => {
    const status = getWorkingStatus({
      isStreaming: true,
      messages: [assistant([])],
    })

    expect(status).toEqual({ title: 'Working', tone: 'working' })
  })

  it('shows concrete permission text', () => {
    const status = getWorkingStatus({
      isStreaming: true,
      messages: [],
      pendingPermissionRequests: [
        {
          id: 'perm-1',
          permission: 'edit',
          sessionID: 'session-1',
          patterns: ['src/App.tsx'],
          metadata: {},
          always: [],
        },
      ],
    })

    expect(status).toEqual({ title: 'Needs approval', detail: 'Waiting for permission: edit src/App.tsx', tone: 'permission' })
  })

  it('shows retry attempts from session status', () => {
    const routeStatus = { type: 'retry', attempt: 2, message: 'rate limited', next: 123 } as SessionStatus

    const status = getWorkingStatus({
      isStreaming: false,
      messages: [],
      routeStatus,
    })

    expect(status).toEqual({ title: 'Retrying', detail: 'Attempt 2: rate limited', tone: 'retry' })
  })
})
