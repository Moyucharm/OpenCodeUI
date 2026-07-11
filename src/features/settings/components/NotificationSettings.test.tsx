import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../i18n'
import { NotificationSettings } from './NotificationSettings'

const { isTauriMock, getDesktopPlatformMock } = vi.hoisted(() => ({
  isTauriMock: vi.fn(),
  getDesktopPlatformMock: vi.fn(),
}))

vi.mock('../../../utils/tauri', () => ({
  isTauri: () => isTauriMock(),
  getDesktopPlatform: () => getDesktopPlatformMock(),
}))

describe('NotificationSettings', () => {
  beforeEach(async () => {
    localStorage.clear()
    isTauriMock.mockReturnValue(false)
    getDesktopPlatformMock.mockReturnValue('other')
    await i18n.changeLanguage('en')
  })

  it('shows child completion reminders even when system notifications are unavailable', () => {
    render(<NotificationSettings />)

    expect(screen.getByText('Child Session Completion Reminders')).toBeInTheDocument()
  })

  it('shows taskbar attention only in the Windows Tauri desktop app', () => {
    isTauriMock.mockReturnValue(true)
    getDesktopPlatformMock.mockReturnValue('windows')

    render(<NotificationSettings />)

    expect(screen.getByText('Windows Taskbar Attention')).toBeInTheDocument()
  })
})
