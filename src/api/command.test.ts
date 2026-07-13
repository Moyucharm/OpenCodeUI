import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeCommand, getCommands } from './command'

const listMock = vi.fn()
const sessionCommandMock = vi.fn()

vi.mock('./sdk', () => ({
  getSDKClient: () => ({
    command: {
      list: (...args: unknown[]) => listMock(...args),
    },
    session: {
      command: (...args: unknown[]) => sessionCommandMock(...args),
    },
  }),
  unwrap: (result: { data?: unknown }) => result.data,
}))

vi.mock('../store/serverStore', () => ({
  serverStore: {
    getActiveServerId: () => 'test-server',
  },
}))

describe('getCommands', () => {
  beforeEach(() => {
    listMock.mockReset()
    sessionCommandMock.mockReset()
  })

  it('marks frontend and api commands with stable sources', async () => {
    listMock.mockResolvedValue({ data: [{ name: 'review', description: 'Run project review' }] })

    const commands = await getCommands('/workspace/project')

    expect(commands).toEqual([
      { name: 'review', description: 'Run project review', source: 'api' },
      { name: 'new', description: 'Create a new chat session', source: 'frontend' },
      { name: 'compact', description: 'Compact session by summarizing conversation history', source: 'frontend' },
    ])
  })

  it('keeps API commands as api commands even if names overlap frontend commands', async () => {
    listMock.mockResolvedValue({ data: [{ name: 'compact', description: 'Native compact command' }] })

    const commands = await getCommands('/workspace/project-overlap')

    expect(commands).toEqual([
      { name: 'compact', description: 'Native compact command', source: 'api' },
      { name: 'new', description: 'Create a new chat session', source: 'frontend' },
    ])
  })

  it('passes agent, model and variant to session commands', async () => {
    sessionCommandMock.mockResolvedValue({ data: { ok: true } })

    await executeCommand('session-1', 'review', 'src/App.tsx', '/workspace/project', {
      agent: 'plan',
      model: 'provider-1/model-1',
      variant: 'high',
    })

    expect(sessionCommandMock).toHaveBeenCalledWith({
      sessionID: 'session-1',
      directory: '/workspace/project',
      command: 'review',
      arguments: 'src/App.tsx',
      agent: 'plan',
      model: 'provider-1/model-1',
      variant: 'high',
    })
  })
})
