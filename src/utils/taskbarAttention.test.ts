import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  isTauriMock,
  getDesktopPlatformMock,
  isTaskbarAttentionEnabledMock,
  getAllWindowsMock,
  getCurrentWindowMock,
  requestUserAttentionMock,
} = vi.hoisted(() => ({
  isTauriMock: vi.fn(),
  getDesktopPlatformMock: vi.fn(),
  isTaskbarAttentionEnabledMock: vi.fn(),
  getAllWindowsMock: vi.fn(),
  getCurrentWindowMock: vi.fn(),
  requestUserAttentionMock: vi.fn(),
}))

vi.mock('./tauri', () => ({
  isTauri: () => isTauriMock(),
  getDesktopPlatform: () => getDesktopPlatformMock(),
}))

vi.mock('../store/notificationEventSettingsStore', () => ({
  notificationEventSettingsStore: {
    isTaskbarAttentionEnabled: () => isTaskbarAttentionEnabledMock(),
  },
}))

vi.mock('@tauri-apps/api/window', () => ({
  UserAttentionType: { Informational: 2 },
  getAllWindows: () => getAllWindowsMock(),
  getCurrentWindow: () => getCurrentWindowMock(),
}))

import { requestTaskbarAttention } from './taskbarAttention'

describe('requestTaskbarAttention', () => {
  beforeEach(() => {
    isTauriMock.mockReturnValue(true)
    getDesktopPlatformMock.mockReturnValue('windows')
    isTaskbarAttentionEnabledMock.mockReturnValue(true)
    getAllWindowsMock.mockResolvedValue([{ isFocused: vi.fn().mockResolvedValue(false) }])
    getCurrentWindowMock.mockReturnValue({ requestUserAttention: requestUserAttentionMock })
    requestUserAttentionMock.mockReset()
  })

  it('does nothing outside Tauri Windows when disabled or focused', async () => {
    isTauriMock.mockReturnValue(false)
    await requestTaskbarAttention()

    getDesktopPlatformMock.mockReturnValue('macos')
    await requestTaskbarAttention()

    getDesktopPlatformMock.mockReturnValue('windows')
    isTaskbarAttentionEnabledMock.mockReturnValue(false)
    await requestTaskbarAttention()

    isTaskbarAttentionEnabledMock.mockReturnValue(true)
    getAllWindowsMock.mockResolvedValue([{ isFocused: vi.fn().mockResolvedValue(true) }])
    await requestTaskbarAttention()

    expect(requestUserAttentionMock).not.toHaveBeenCalled()
  })

  it('requests informational attention when no OpenCode window is focused', async () => {
    await requestTaskbarAttention()

    expect(requestUserAttentionMock).toHaveBeenCalledWith(2)
  })
})
