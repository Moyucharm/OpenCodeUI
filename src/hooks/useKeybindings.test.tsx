import { fireEvent, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { keybindingStore } from '../store/keybindingStore'
import { useGlobalKeybindings } from './useKeybindings'

describe('useGlobalKeybindings dialog handling', () => {
  beforeEach(() => {
    keybindingStore.resetAll()
    keybindingStore.setPreset('web')
    keybindingStore.setKeybinding('cancelMessage', 'Escape')
  })

  afterEach(() => {
    keybindingStore.resetAll()
    keybindingStore.setPreset('web')
  })

  it('handles cancelMessage while a non-modal dialog is open', () => {
    const onCancel = vi.fn()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.append(dialog)
    const { unmount } = renderHook(() => useGlobalKeybindings({ cancelMessage: onCancel }))

    try {
      fireEvent.keyDown(document.body, { key: 'Escape' })

      expect(onCancel).toHaveBeenCalledTimes(1)
    } finally {
      unmount()
      dialog.remove()
    }
  })

  it('blocks cancelMessage while an aria-modal dialog is open', () => {
    const onCancel = vi.fn()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    document.body.append(dialog)
    const { unmount } = renderHook(() => useGlobalKeybindings({ cancelMessage: onCancel }))

    try {
      fireEvent.keyDown(document.body, { key: 'Escape' })

      expect(onCancel).not.toHaveBeenCalled()
    } finally {
      unmount()
      dialog.remove()
    }
  })
})
