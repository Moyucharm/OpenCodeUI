import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiPermissionRequest } from '../../api'
import { keybindingStore } from '../../store/keybindingStore'
import { PermissionDialog } from './PermissionDialog'

vi.mock('./chatViewport', () => ({
  useChatViewport: () => ({
    presentation: { isCompact: false },
  }),
}))

vi.mock('../../hooks', () => ({
  usePresence: (show: boolean) => ({ shouldRender: show, ref: { current: null } }),
}))

function permissionRequest(): ApiPermissionRequest {
  return {
    id: 'permission-1',
    sessionID: 'session-1',
    permission: 'bash',
  } as ApiPermissionRequest
}

describe('PermissionDialog', () => {
  beforeEach(() => {
    keybindingStore.resetAll()
    keybindingStore.setPreset('web')
  })

  afterEach(() => {
    keybindingStore.resetAll()
    keybindingStore.setPreset('web')
  })

  it('accepts plain Enter before the underlying composer', () => {
    const onReply = vi.fn()
    const onComposerKeyDown = vi.fn()

    render(
      <>
        <textarea aria-label="Composer" onKeyDown={onComposerKeyDown} />
        <PermissionDialog request={permissionRequest()} onReply={onReply} keyboardEnabled={true} />
      </>,
    )

    const event = createEvent.keyDown(screen.getByRole('textbox', { name: 'Composer' }), { key: 'Enter' })
    fireEvent(screen.getByRole('textbox', { name: 'Composer' }), event)

    expect(onReply).toHaveBeenCalledWith('once')
    expect(onComposerKeyDown).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
    const region = screen.getByRole('region', { name: 'Permission: bash' })
    expect(region).toHaveAttribute('aria-labelledby')
    expect(region).toHaveAttribute('data-permission-dialog')
    expect(screen.queryByRole('dialog', { name: 'Permission: bash' })).not.toBeInTheDocument()
  })

  it('accepts custom Ctrl+K while retaining plain Enter', () => {
    const onReply = vi.fn()
    keybindingStore.setKeybinding('sendMessage', 'Enter')
    keybindingStore.setKeybinding('sendMessage', 'Ctrl+K')
    render(<PermissionDialog request={permissionRequest()} onReply={onReply} keyboardEnabled={true} />)

    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
    fireEvent.keyDown(document.body, { key: 'Enter' })

    expect(onReply).toHaveBeenNthCalledWith(1, 'once')
    expect(onReply).toHaveBeenNthCalledWith(2, 'once')
  })

  it('only lets the keyboard-enabled dialog reply when multiple dialogs are mounted', () => {
    const onFocusedReply = vi.fn()
    const onUnfocusedReply = vi.fn()
    render(
      <>
        <PermissionDialog request={permissionRequest()} onReply={onUnfocusedReply} keyboardEnabled={false} />
        <PermissionDialog request={permissionRequest()} onReply={onFocusedReply} keyboardEnabled={true} />
      </>,
    )

    fireEvent.keyDown(document.body, { key: 'Enter' })

    expect(onFocusedReply).toHaveBeenCalledWith('once')
    expect(onUnfocusedReply).not.toHaveBeenCalled()
  })

  it('prevents document capture listeners from handling confirmed Enter', () => {
    const onReply = vi.fn()
    const onDocumentCapture = vi.fn()
    render(<PermissionDialog request={permissionRequest()} onReply={onReply} keyboardEnabled={true} />)

    document.addEventListener('keydown', onDocumentCapture, { capture: true })
    try {
      fireEvent.keyDown(document.body, { key: 'Enter' })

      expect(onReply).toHaveBeenCalledWith('once')
      expect(onDocumentCapture).not.toHaveBeenCalled()
    } finally {
      document.removeEventListener('keydown', onDocumentCapture, { capture: true })
    }
  })

  it('leaves Enter on permission dialog buttons to native button handling', () => {
    const onReply = vi.fn()
    render(<PermissionDialog request={permissionRequest()} onReply={onReply} keyboardEnabled={true} />)

    const buttons = [
      screen.getByRole('button', { name: /allow once/i }),
      screen.getByRole('button', { name: /always allow/i }),
      screen.getByRole('button', { name: /reject/i }),
      screen.getByTitle('Minimize'),
    ]

    for (const button of buttons) {
      const event = createEvent.keyDown(button, { key: 'Enter' })
      fireEvent(button, event)

      expect(event.defaultPrevented).toBe(false)
    }

    expect(onReply).not.toHaveBeenCalled()
  })

  it('does not consume Enter while an aria-modal dialog is open', () => {
    const onReply = vi.fn()
    const onDocumentCapture = vi.fn()
    const modal = document.createElement('div')
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')
    document.body.append(modal)
    render(<PermissionDialog request={permissionRequest()} onReply={onReply} keyboardEnabled={true} />)

    document.addEventListener('keydown', onDocumentCapture, { capture: true })
    const event = createEvent.keyDown(document.body, { key: 'Enter' })
    try {
      fireEvent(document.body, event)

      expect(onReply).not.toHaveBeenCalled()
      expect(event.defaultPrevented).toBe(false)
      expect(onDocumentCapture).toHaveBeenCalled()
    } finally {
      document.removeEventListener('keydown', onDocumentCapture, { capture: true })
      modal.remove()
    }
  })

  it('does not consume reply keys while a dropdown is open', () => {
    const onReply = vi.fn()
    const onDocumentCapture = vi.fn()
    const dropdown = document.createElement('div')
    dropdown.dataset.dropdownOpen = 'true'
    document.body.append(dropdown)
    render(<PermissionDialog request={permissionRequest()} onReply={onReply} keyboardEnabled={true} />)

    document.addEventListener('keydown', onDocumentCapture, { capture: true })
    const enter = createEvent.keyDown(document.body, { key: 'Enter' })
    const escape = createEvent.keyDown(document.body, { key: 'Escape' })
    try {
      fireEvent(document.body, enter)
      fireEvent(document.body, escape)

      expect(onReply).not.toHaveBeenCalled()
      expect(enter.defaultPrevented).toBe(false)
      expect(escape.defaultPrevented).toBe(false)
      expect(onDocumentCapture).toHaveBeenCalledTimes(2)
    } finally {
      document.removeEventListener('keydown', onDocumentCapture, { capture: true })
      dropdown.remove()
    }
  })

  it('rejects with Escape', () => {
    const onReply = vi.fn()
    render(<PermissionDialog request={permissionRequest()} onReply={onReply} keyboardEnabled={true} />)

    fireEvent.keyDown(document.body, { key: 'Escape' })

    expect(onReply).toHaveBeenCalledWith('reject')
  })

  it('does not reply to Escape or a custom send key during IME composition', () => {
    const onReply = vi.fn()
    keybindingStore.setKeybinding('sendMessage', 'Ctrl+K')
    render(<PermissionDialog request={permissionRequest()} onReply={onReply} keyboardEnabled={true} />)

    fireEvent.keyDown(document.body, { key: 'Enter', isComposing: true })
    fireEvent.keyDown(document.body, { key: 'Escape', isComposing: true })
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true, isComposing: true })
    const escapeCommit = createEvent.keyDown(document.body, { key: 'Escape' })
    const sendCommit = createEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
    Object.defineProperty(escapeCommit, 'keyCode', { value: 229 })
    Object.defineProperty(sendCommit, 'keyCode', { value: 229 })
    fireEvent(document.body, escapeCommit)
    fireEvent(document.body, sendCommit)

    expect(onReply).not.toHaveBeenCalled()
  })

  it('consumes plain Enter, custom send, and Escape while replying', () => {
    const onReply = vi.fn()
    const onComposerKeyDown = vi.fn()

    render(
      <>
        <textarea aria-label="Composer" onKeyDown={onComposerKeyDown} />
        <PermissionDialog request={permissionRequest()} onReply={onReply} keyboardEnabled={true} isReplying />
      </>,
    )

    const enter = createEvent.keyDown(screen.getByRole('textbox', { name: 'Composer' }), { key: 'Enter' })
    const customSend = createEvent.keyDown(screen.getByRole('textbox', { name: 'Composer' }), {
      key: 'Enter',
      ctrlKey: true,
    })
    const escape = createEvent.keyDown(screen.getByRole('textbox', { name: 'Composer' }), { key: 'Escape' })
    fireEvent(screen.getByRole('textbox', { name: 'Composer' }), enter)
    fireEvent(screen.getByRole('textbox', { name: 'Composer' }), customSend)
    fireEvent(screen.getByRole('textbox', { name: 'Composer' }), escape)

    expect(onReply).not.toHaveBeenCalled()
    expect(onComposerKeyDown).not.toHaveBeenCalled()
    expect(enter.defaultPrevented).toBe(true)
    expect(customSend.defaultPrevented).toBe(true)
    expect(escape.defaultPrevented).toBe(true)
  })

  it('does not listen while collapsed', () => {
    const onReply = vi.fn()
    render(<PermissionDialog request={permissionRequest()} onReply={onReply} keyboardEnabled={true} collapsed />)

    fireEvent.keyDown(document.body, { key: 'Enter' })

    expect(onReply).not.toHaveBeenCalled()
  })
})
