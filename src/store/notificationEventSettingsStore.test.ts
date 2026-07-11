import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('notificationEventSettingsStore', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('persists system notification toggles', async () => {
    const { notificationEventSettingsStore } = await import('./notificationEventSettingsStore')

    notificationEventSettingsStore.setSystemEnabled('completed', false)
    notificationEventSettingsStore.setSystemEnabled('question', false)

    const persisted = JSON.parse(localStorage.getItem('opencode:notification-event-settings') || 'null')
    expect(persisted).toEqual({
      childSessionCompletionEnabled: false,
      taskbarAttentionEnabled: false,
      events: {
        completed: { systemEnabled: false },
        permission: { systemEnabled: true },
        question: { systemEnabled: false },
        error: { systemEnabled: true },
      },
    })
  })

  it('defaults child session completion reminders to disabled', async () => {
    const { notificationEventSettingsStore, exportNotificationEventSettingsBackup } = await import(
      './notificationEventSettingsStore'
    )

    expect(notificationEventSettingsStore.isChildSessionCompletionEnabled()).toBe(false)
    expect(notificationEventSettingsStore.getSnapshot().childSessionCompletionEnabled).toBe(false)
    expect(exportNotificationEventSettingsBackup().childSessionCompletionEnabled).toBe(false)
    expect(notificationEventSettingsStore.isTaskbarAttentionEnabled()).toBe(false)
    expect(exportNotificationEventSettingsBackup().taskbarAttentionEnabled).toBe(false)
  })

  it('falls back to disabled for legacy storage and backups without the new setting', async () => {
    localStorage.setItem(
      'opencode:notification-event-settings',
      JSON.stringify({
        events: {
          completed: { systemEnabled: false },
          permission: { systemEnabled: false },
          question: { systemEnabled: false },
          error: { systemEnabled: false },
        },
      }),
    )
    vi.resetModules()
    const {
      notificationEventSettingsStore,
      importNotificationEventSettingsBackup,
      exportNotificationEventSettingsBackup,
    } = await import('./notificationEventSettingsStore')

    expect(notificationEventSettingsStore.isChildSessionCompletionEnabled()).toBe(false)

    importNotificationEventSettingsBackup({
      events: {
        completed: { systemEnabled: true },
        permission: { systemEnabled: true },
        question: { systemEnabled: true },
        error: { systemEnabled: true },
      },
    })

    expect(exportNotificationEventSettingsBackup().childSessionCompletionEnabled).toBe(false)
    expect(exportNotificationEventSettingsBackup().taskbarAttentionEnabled).toBe(false)
  })

  it('persists the child session completion reminder toggle', async () => {
    const { notificationEventSettingsStore } = await import('./notificationEventSettingsStore')

    notificationEventSettingsStore.setChildSessionCompletionEnabled(true)

    expect(notificationEventSettingsStore.isChildSessionCompletionEnabled()).toBe(true)
    expect(JSON.parse(localStorage.getItem('opencode:notification-event-settings') || 'null')).toMatchObject({
      childSessionCompletionEnabled: true,
    })
  })

  it('updates the live snapshot and notifies subscribers when importing a backup', async () => {
    const { notificationEventSettingsStore, importNotificationEventSettingsBackup } = await import(
      './notificationEventSettingsStore'
    )
    const listener = vi.fn()
    const unsubscribe = notificationEventSettingsStore.subscribe(listener)

    importNotificationEventSettingsBackup({ childSessionCompletionEnabled: true, taskbarAttentionEnabled: true })

    expect(notificationEventSettingsStore.getSnapshot().childSessionCompletionEnabled).toBe(true)
    expect(JSON.parse(localStorage.getItem('opencode:notification-event-settings') || 'null')).toMatchObject({
      childSessionCompletionEnabled: true,
      taskbarAttentionEnabled: true,
    })
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
  })
})
