import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSessionInfoMock, isChildSessionCompletionEnabledMock } = vi.hoisted(() => ({
  getSessionInfoMock: vi.fn(),
  isChildSessionCompletionEnabledMock: vi.fn(),
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

import { shouldNotifySessionCompletion } from './sessionCompletionNotificationPolicy'

describe('shouldNotifySessionCompletion', () => {
  beforeEach(() => {
    getSessionInfoMock.mockReset()
    isChildSessionCompletionEnabledMock.mockReset()
    isChildSessionCompletionEnabledMock.mockReturnValue(false)
  })

  it('suppresses known child sessions while the setting is disabled', () => {
    getSessionInfoMock.mockReturnValue({ id: 'child-session' })

    expect(shouldNotifySessionCompletion('child-session')).toBe(false)
  })

  it('allows known child sessions while the setting is enabled', () => {
    getSessionInfoMock.mockReturnValue({ id: 'child-session' })
    isChildSessionCompletionEnabledMock.mockReturnValue(true)

    expect(shouldNotifySessionCompletion('child-session')).toBe(true)
  })

  it('fails open when the session relationship is unknown', () => {
    getSessionInfoMock.mockReturnValue(undefined)

    expect(shouldNotifySessionCompletion('unknown-session')).toBe(true)
  })
})
