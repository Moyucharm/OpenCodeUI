import { useSyncExternalStore } from 'react'
import type { NotificationType } from './notificationStore'

export interface NotificationEventConfig {
  systemEnabled: boolean
}

export interface NotificationEventSettings {
  childSessionCompletionEnabled: boolean
  taskbarAttentionEnabled: boolean
  events: Record<NotificationType, NotificationEventConfig>
}

export interface NotificationEventSettingsBackup {
  childSessionCompletionEnabled: boolean
  taskbarAttentionEnabled: boolean
  events: Record<NotificationType, NotificationEventConfig>
}

type Subscriber = () => void

const STORAGE_KEY = 'opencode:notification-event-settings'

function createDefaultSettings(): NotificationEventSettings {
  return {
    childSessionCompletionEnabled: false,
    taskbarAttentionEnabled: false,
    events: {
      completed: { systemEnabled: true },
      permission: { systemEnabled: true },
      question: { systemEnabled: true },
      error: { systemEnabled: true },
    },
  }
}

function loadSettings(): NotificationEventSettings {
  const defaults = createDefaultSettings()

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults

    const parsed = JSON.parse(raw)
    return {
      childSessionCompletionEnabled:
        typeof parsed?.childSessionCompletionEnabled === 'boolean'
          ? parsed.childSessionCompletionEnabled
          : defaults.childSessionCompletionEnabled,
      taskbarAttentionEnabled:
        typeof parsed?.taskbarAttentionEnabled === 'boolean'
          ? parsed.taskbarAttentionEnabled
          : defaults.taskbarAttentionEnabled,
      events: {
        completed: {
          systemEnabled:
            typeof parsed?.events?.completed?.systemEnabled === 'boolean'
              ? parsed.events.completed.systemEnabled
              : defaults.events.completed.systemEnabled,
        },
        permission: {
          systemEnabled:
            typeof parsed?.events?.permission?.systemEnabled === 'boolean'
              ? parsed.events.permission.systemEnabled
              : defaults.events.permission.systemEnabled,
        },
        question: {
          systemEnabled:
            typeof parsed?.events?.question?.systemEnabled === 'boolean'
              ? parsed.events.question.systemEnabled
              : defaults.events.question.systemEnabled,
        },
        error: {
          systemEnabled:
            typeof parsed?.events?.error?.systemEnabled === 'boolean'
              ? parsed.events.error.systemEnabled
              : defaults.events.error.systemEnabled,
        },
      },
    }
  } catch {
    return defaults
  }
}

function saveSettings(settings: NotificationEventSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Ignore storage write failures.
  }
}

function normalizeSettings(raw: unknown): NotificationEventSettings {
  const defaults = createDefaultSettings()
  const parsed = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined

  return {
    childSessionCompletionEnabled:
      typeof parsed?.childSessionCompletionEnabled === 'boolean'
        ? parsed.childSessionCompletionEnabled
        : defaults.childSessionCompletionEnabled,
    taskbarAttentionEnabled:
      typeof parsed?.taskbarAttentionEnabled === 'boolean'
        ? parsed.taskbarAttentionEnabled
        : defaults.taskbarAttentionEnabled,
    events: {
      completed: {
        systemEnabled:
          typeof parsed?.events === 'object' &&
          parsed.events &&
          typeof (parsed.events as Record<string, unknown>).completed === 'object' &&
          typeof ((parsed.events as Record<string, unknown>).completed as Record<string, unknown>).systemEnabled ===
            'boolean'
            ? (((parsed.events as Record<string, unknown>).completed as Record<string, unknown>)
                .systemEnabled as boolean)
            : defaults.events.completed.systemEnabled,
      },
      permission: {
        systemEnabled:
          typeof parsed?.events === 'object' &&
          parsed.events &&
          typeof (parsed.events as Record<string, unknown>).permission === 'object' &&
          typeof ((parsed.events as Record<string, unknown>).permission as Record<string, unknown>).systemEnabled ===
            'boolean'
            ? (((parsed.events as Record<string, unknown>).permission as Record<string, unknown>)
                .systemEnabled as boolean)
            : defaults.events.permission.systemEnabled,
      },
      question: {
        systemEnabled:
          typeof parsed?.events === 'object' &&
          parsed.events &&
          typeof (parsed.events as Record<string, unknown>).question === 'object' &&
          typeof ((parsed.events as Record<string, unknown>).question as Record<string, unknown>).systemEnabled ===
            'boolean'
            ? (((parsed.events as Record<string, unknown>).question as Record<string, unknown>)
                .systemEnabled as boolean)
            : defaults.events.question.systemEnabled,
      },
      error: {
        systemEnabled:
          typeof parsed?.events === 'object' &&
          parsed.events &&
          typeof (parsed.events as Record<string, unknown>).error === 'object' &&
          typeof ((parsed.events as Record<string, unknown>).error as Record<string, unknown>).systemEnabled ===
            'boolean'
            ? (((parsed.events as Record<string, unknown>).error as Record<string, unknown>).systemEnabled as boolean)
            : defaults.events.error.systemEnabled,
      },
    },
  }
}

class NotificationEventSettingsStore {
  private state: NotificationEventSettings = loadSettings()
  private subscribers = new Set<Subscriber>()

  subscribe = (callback: Subscriber): (() => void) => {
    this.subscribers.add(callback)
    return () => this.subscribers.delete(callback)
  }

  getSnapshot = (): NotificationEventSettings => this.state

  private notify() {
    this.subscribers.forEach(cb => cb())
  }

  private persist() {
    saveSettings(this.state)
  }

  isSystemEnabled(type: NotificationType): boolean {
    return this.state.events[type]?.systemEnabled !== false
  }

  isChildSessionCompletionEnabled(): boolean {
    return this.state.childSessionCompletionEnabled
  }

  isTaskbarAttentionEnabled(): boolean {
    return this.state.taskbarAttentionEnabled
  }

  setSystemEnabled(type: NotificationType, systemEnabled: boolean) {
    this.state = {
      ...this.state,
      events: {
        ...this.state.events,
        [type]: { systemEnabled },
      },
    }
    this.persist()
    this.notify()
  }

  setChildSessionCompletionEnabled(childSessionCompletionEnabled: boolean) {
    this.state = {
      ...this.state,
      childSessionCompletionEnabled,
    }
    this.persist()
    this.notify()
  }

  setTaskbarAttentionEnabled(taskbarAttentionEnabled: boolean) {
    this.state = {
      ...this.state,
      taskbarAttentionEnabled,
    }
    this.persist()
    this.notify()
  }

  importSettings(raw: unknown) {
    this.state = normalizeSettings(raw)
    this.persist()
    this.notify()
  }
}

export const notificationEventSettingsStore = new NotificationEventSettingsStore()

export function exportNotificationEventSettingsBackup(): NotificationEventSettingsBackup {
  return normalizeSettings(notificationEventSettingsStore.getSnapshot())
}

export function importNotificationEventSettingsBackup(raw: unknown): void {
  notificationEventSettingsStore.importSettings(raw)
}

export function useNotificationEventSettings(): NotificationEventSettings {
  return useSyncExternalStore(notificationEventSettingsStore.subscribe, notificationEventSettingsStore.getSnapshot)
}
