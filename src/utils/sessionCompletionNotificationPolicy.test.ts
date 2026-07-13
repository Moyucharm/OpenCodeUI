import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSessionInfoMock, isChildSessionCompletionEnabledMock, getSessionMock } = vi.hoisted(() => ({
  getSessionInfoMock: vi.fn(),
  isChildSessionCompletionEnabledMock: vi.fn(),
  getSessionMock: vi.fn(),
}))

vi.mock('../store/childSessionStore', () => ({
  childSessionStore: {
    getSessionInfo: getSessionInfoMock,
  },
}))

vi.mock('../store/notificationEventSettingsStore', () => ({
  notificationEventSettingsStore: {
    isChildSessionCompletionEnabled: isChildSessionCompletionEnabledMock,
  },
}))

vi.mock('../api/session', () => ({
  getSession: (...args: unknown[]) => getSessionMock(...args),
}))

import { shouldNotifySessionCompletion } from './sessionCompletionNotificationPolicy'

describe('shouldNotifySessionCompletion', () => {
  beforeEach(() => {
    getSessionInfoMock.mockReset()
    isChildSessionCompletionEnabledMock.mockReset()
    getSessionMock.mockReset()
    isChildSessionCompletionEnabledMock.mockReturnValue(false)
  })

  it('suppresses known child sessions while the setting is disabled', async () => {
    getSessionInfoMock.mockReturnValue({ id: 'child-session' })

    await expect(shouldNotifySessionCompletion('child-session')).resolves.toBe(false)
  })

  it('allows known child sessions while the setting is enabled', async () => {
    getSessionInfoMock.mockReturnValue({ id: 'child-session' })
    isChildSessionCompletionEnabledMock.mockReturnValue(true)

    await expect(shouldNotifySessionCompletion('child-session')).resolves.toBe(true)
  })

  it('allows known main sessions when the relationship is resolved', async () => {
    getSessionInfoMock.mockReturnValue(undefined)
    getSessionMock.mockResolvedValue({ id: 'main-session' })

    await expect(shouldNotifySessionCompletion('main-session')).resolves.toBe(true)
  })

  it('suppresses resolved child sessions when the relationship was unknown locally', async () => {
    getSessionInfoMock.mockReturnValue(undefined)
    getSessionMock.mockResolvedValue({ id: 'child-session', parentID: 'main-session' })

    await expect(shouldNotifySessionCompletion('child-session')).resolves.toBe(false)
  })

  it('suppresses completion when the session relationship cannot be resolved', async () => {
    getSessionInfoMock.mockReturnValue(undefined)
    getSessionMock.mockRejectedValue(new Error('offline'))

    await expect(shouldNotifySessionCompletion('unknown-session')).resolves.toBe(false)
  })
})
