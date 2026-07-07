import { beforeEach, describe, expect, it } from 'vitest'
import { keybindingStore } from './keybindingStore'

function keyboardEvent(key: string, init: KeyboardEventInit = {}) {
  return new KeyboardEvent('keydown', { key, ...init })
}

describe('keybindingStore scoped keybindings', () => {
  beforeEach(() => {
    keybindingStore.resetAll()
    keybindingStore.setPreset('web')
  })

  it('keeps terminal shortcuts in the terminal scope', () => {
    expect(keybindingStore.findMatchingAction(keyboardEvent('c', { ctrlKey: true }), 'terminal')).toBe(
      'terminal.copySelection',
    )
    expect(keybindingStore.findMatchingAction(keyboardEvent('v', { ctrlKey: true }), 'terminal')).toBe('terminal.paste')
    expect(keybindingStore.findMatchingAction(keyboardEvent('c', { ctrlKey: true }), 'global')).toBeNull()
  })

  it('checks conflicts only within the requested scope', () => {
    expect(keybindingStore.isKeyUsed('Ctrl+C', undefined, 'terminal')).toBe(true)
    expect(keybindingStore.isKeyUsed('Ctrl+C', undefined, 'global')).toBe(false)
  })

  it('applies TUI defaults to unmodified keybindings', () => {
    keybindingStore.setPreset('tui')

    expect(keybindingStore.getKey('toggleAgent')).toBe('Tab')
    expect(keybindingStore.getKey('toggleVariant')).toBe('Ctrl+T')
    expect(keybindingStore.getKey('sendMessage')).toBe('Enter')
    expect(keybindingStore.getKey('commandPalette')).toBe('Ctrl+P')
  })

  it('does not overwrite customized keybindings when applying TUI defaults', () => {
    keybindingStore.setKeybinding('toggleAgent', 'Alt+A')

    keybindingStore.setPreset('tui')

    expect(keybindingStore.getKey('toggleAgent')).toBe('Alt+A')
    expect(keybindingStore.getKey('sendMessage')).toBe('Enter')
  })

  it('restores only preset-managed TUI keybindings when returning to web defaults', () => {
    keybindingStore.setPreset('tui')
    keybindingStore.setKeybinding('toggleAgent', 'Alt+A')

    keybindingStore.setPreset('web')

    expect(keybindingStore.getKey('toggleAgent')).toBe('Alt+A')
    expect(keybindingStore.getKey('sendMessage')).toBe('Ctrl+Enter')
  })

  it('keeps custom keybindings that match the next preset default when switching back', () => {
    keybindingStore.setKeybinding('sendMessage', 'Enter')

    keybindingStore.setPreset('tui')
    keybindingStore.setPreset('web')

    expect(keybindingStore.getKey('sendMessage')).toBe('Enter')
  })

  it('does not apply a preset override when it collides with a custom keybinding', () => {
    const webToggleAgentKey = keybindingStore.getKey('toggleAgent')
    keybindingStore.setKeybinding('focusInput', 'Tab')

    keybindingStore.setPreset('tui')

    expect(keybindingStore.getKey('focusInput')).toBe('Tab')
    expect(keybindingStore.getKey('toggleAgent')).toBe(webToggleAgentKey)
  })
})
