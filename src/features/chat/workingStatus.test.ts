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

function user(id = 'user-1'): Message {
  return {
    info: {
      id,
      role: 'user',
      sessionID: 'session-1',
      time: { created: 0 },
      agent: 'build',
      model: { providerID: 'anthropic', modelID: 'claude-sonnet-4' },
    },
    parts: [
      {
        id: `${id}-text`,
        type: 'text',
        sessionID: 'session-1',
        messageID: id,
        text: 'hello',
      },
    ],
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

    expect(status?.detail).toBe('正在运行 bash：npm run test:run')
  })

  it('shows waiting for model response when only generic streaming state is available', () => {
    const status = getWorkingStatus({
      isStreaming: true,
      messages: [assistant([])],
    })

    expect(status).toEqual({ title: '正在等待模型回应', tone: 'working' })
  })

  it('shows waiting for model response after the latest user message', () => {
    const status = getWorkingStatus({
      isStreaming: true,
      messages: [assistant([{ id: 'old-text', type: 'text', sessionID: 'session-1', messageID: 'assistant-1', text: 'old' }]), user('user-2')],
    })

    expect(status).toEqual({ title: '正在等待模型回应', tone: 'working' })
  })

  it('shows model reasoning status from the latest assistant message', () => {
    const status = getWorkingStatus({
      isStreaming: true,
      messages: [
        user(),
        assistant([
          {
            id: 'reasoning-1',
            type: 'reasoning',
            sessionID: 'session-1',
            messageID: 'assistant-1',
            text: 'thinking',
            time: { start: 1 },
          },
        ]),
      ],
    })

    expect(status).toEqual({ title: '处理中', detail: '模型回复中', tone: 'working' })
  })

  it('shows model reply status from the latest assistant message', () => {
    const status = getWorkingStatus({
      isStreaming: true,
      messages: [user(), assistant([{ id: 'text-1', type: 'text', sessionID: 'session-1', messageID: 'assistant-1', text: 'reply' }])],
    })

    expect(status).toEqual({ title: '处理中', detail: '模型回复中', tone: 'working' })
  })

  it('shows waiting for model response when the assistant message has no parts yet', () => {
    const status = getWorkingStatus({
      isStreaming: true,
      messages: [user(), assistant([])],
    })

    expect(status).toEqual({ title: '正在等待模型回应', tone: 'working' })
  })

  it('shows raw tool names while tool input is being prepared', () => {
    const status = getWorkingStatus({
      isStreaming: true,
      messages: [user()],
      runtimeActivity: { type: 'tool-input', sessionID: 'session-1', callID: 'call-1', toolName: 'find_text' },
    })

    expect(status).toEqual({ title: '正在准备', detail: 'find_text', separator: 'colon', tone: 'working' })
  })

  it('shows subagent status for active task tools', () => {
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
            tool: 'task',
            state: {
              status: 'running',
              input: { subagent_type: 'explore', description: '查找运行状态' },
              time: { start: 1 },
            },
          },
        ]),
      ],
    })

    expect(status).toEqual({ title: '子代理处理中', detail: 'explore：查找运行状态', separator: 'colon', tone: 'working' })
  })

  it('shows compaction status from runtime activity', () => {
    const status = getWorkingStatus({
      isStreaming: true,
      messages: [user()],
      runtimeActivity: { type: 'compaction', sessionID: 'session-1' },
    })

    expect(status).toEqual({ title: '压缩上下文...', tone: 'working' })
  })

  it('ignores stale running tool parts when the session is not active', () => {
    const status = getWorkingStatus({
      isStreaming: false,
      messages: [
        {
          ...assistant([
            {
              id: 'tool-1',
              type: 'tool',
              sessionID: 'session-1',
              messageID: 'assistant-1',
              callID: 'call-1',
              tool: 'bash',
              state: { status: 'running', input: {}, title: 'npm run build', time: { start: 1 } },
            },
          ]),
          isStreaming: false,
        },
      ],
    })

    expect(status).toBeNull()
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

    expect(status).toEqual({ title: '需要确认', detail: '等待权限确认：edit src/App.tsx', tone: 'permission' })
  })

  it('shows retry attempts from session status', () => {
    const routeStatus = { type: 'retry', attempt: 2, message: 'rate limited', next: 123 } as SessionStatus

    const status = getWorkingStatus({
      isStreaming: false,
      messages: [],
      routeStatus,
    })

    expect(status).toEqual({ title: '正在重试', detail: '第 2 次尝试：rate limited', tone: 'retry' })
  })
})
