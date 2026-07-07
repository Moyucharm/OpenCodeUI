// ============================================
// Keybinding Store - 快捷键配置管理
// ============================================

/**
 * 快捷键动作 ID
 */
export type KeybindingAction =
  // General
  | 'openSettings'
  | 'openProject'
  | 'commandPalette'
  | 'toggleSidebar'
  | 'toggleRightPanel'
  | 'focusInput'
  // Session
  | 'newSession'
  | 'archiveSession'
  | 'previousSession'
  | 'nextSession'
  // Terminal
  | 'toggleTerminal'
  | 'newTerminal'
  | 'terminal.copySelection'
  | 'terminal.paste'
  // Model
  | 'selectModel'
  | 'toggleAgent'
  | 'toggleVariant'
  // Message
  | 'sendMessage'
  | 'cancelMessage'
  | 'copyLastResponse'
  // Permission
  | 'toggleFullAuto'
  // Pane
  | 'focusNextPane'
  | 'focusPrevPane'
  | 'splitRight'
  | 'splitDown'
  | 'closePane'
  | 'togglePaneFullscreen'

/**
 * 快捷键配置
 */
export interface KeybindingConfig {
  action: KeybindingAction
  label: string
  description: string
  defaultKey: string // 默认快捷键
  currentKey: string // 当前快捷键（用户可修改）
  category: 'general' | 'session' | 'terminal' | 'model' | 'message' | 'permission' | 'pane'
  scope: 'global' | 'terminal'
}

export type KeybindingPreset = 'web' | 'tui'

/**
 * 解析后的快捷键
 */
export interface ParsedKeybinding {
  key: string // 主键 (小写)
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean // Command/Win
}

type Listener = () => void

const STORAGE_KEY = 'opencode-keybindings'
const STORAGE_KEY_PRESET = 'opencode-keybinding-preset'

/**
 * 默认快捷键配置
 *
 * 注意：浏览器保留了某些快捷键无法被覆盖，如：
 * - Ctrl+L (地址栏), Ctrl+O (打开文件), Ctrl+N (新窗口)
 * - Ctrl+W (关闭标签), Ctrl+T (新标签), Ctrl+Tab (切换标签)
 *
 * 因此我们使用 Alt 组合键或 Ctrl+Shift 组合键来避免冲突
 */
const DEFAULT_KEYBINDINGS: KeybindingConfig[] = [
  // General - 使用 Alt 组合避免浏览器冲突
  {
    action: 'openSettings',
    label: 'Open Settings',
    description: 'Open settings dialog',
    defaultKey: 'Alt+,',
    currentKey: 'Alt+,',
    category: 'general',
    scope: 'global',
  },
  {
    action: 'openProject',
    label: 'Open Project',
    description: 'Open project selector',
    defaultKey: 'Alt+O',
    currentKey: 'Alt+O',
    category: 'general',
    scope: 'global',
  },
  {
    action: 'commandPalette',
    label: 'Command Palette',
    description: 'Open command palette',
    defaultKey: 'Ctrl+Shift+P',
    currentKey: 'Ctrl+Shift+P',
    category: 'general',
    scope: 'global',
  },
  {
    action: 'toggleSidebar',
    label: 'Toggle Sidebar',
    description: 'Show/hide sidebar',
    defaultKey: 'Alt+B',
    currentKey: 'Alt+B',
    category: 'general',
    scope: 'global',
  },
  {
    action: 'toggleRightPanel',
    label: 'Toggle Right Panel',
    description: 'Show/hide right panel',
    defaultKey: 'Alt+\\',
    currentKey: 'Alt+\\',
    category: 'general',
    scope: 'global',
  },
  {
    action: 'focusInput',
    label: 'Focus Input',
    description: 'Focus message input',
    defaultKey: 'Alt+I',
    currentKey: 'Alt+I',
    category: 'general',
    scope: 'global',
  },

  // Session
  {
    action: 'newSession',
    label: 'New Session',
    description: 'Create new chat session',
    defaultKey: 'Alt+N',
    currentKey: 'Alt+N',
    category: 'session',
    scope: 'global',
  },
  {
    action: 'archiveSession',
    label: 'Archive Session',
    description: 'Archive current session',
    defaultKey: 'Alt+Backspace',
    currentKey: 'Alt+Backspace',
    category: 'session',
    scope: 'global',
  },
  {
    action: 'previousSession',
    label: 'Previous Session',
    description: 'Switch to previous session',
    defaultKey: 'Alt+ArrowUp',
    currentKey: 'Alt+ArrowUp',
    category: 'session',
    scope: 'global',
  },
  {
    action: 'nextSession',
    label: 'Next Session',
    description: 'Switch to next session',
    defaultKey: 'Alt+ArrowDown',
    currentKey: 'Alt+ArrowDown',
    category: 'session',
    scope: 'global',
  },

  // Terminal
  {
    action: 'toggleTerminal',
    label: 'Toggle Terminal',
    description: 'Show/hide terminal panel',
    defaultKey: 'Alt+`',
    currentKey: 'Alt+`',
    category: 'terminal',
    scope: 'global',
  },
  {
    action: 'newTerminal',
    label: 'New Terminal',
    description: 'Open new terminal tab',
    defaultKey: 'Alt+T',
    currentKey: 'Alt+T',
    category: 'terminal',
    scope: 'global',
  },
  {
    action: 'terminal.copySelection',
    label: 'Copy Terminal Selection',
    description: 'Copy the current terminal selection',
    defaultKey: 'Ctrl+C',
    currentKey: 'Ctrl+C',
    category: 'terminal',
    scope: 'terminal',
  },
  {
    action: 'terminal.paste',
    label: 'Paste Into Terminal',
    description: 'Paste clipboard text into the terminal',
    defaultKey: 'Ctrl+V',
    currentKey: 'Ctrl+V',
    category: 'terminal',
    scope: 'terminal',
  },

  // Model
  {
    action: 'selectModel',
    label: 'Select Model',
    description: 'Open model selector',
    defaultKey: 'Alt+M',
    currentKey: 'Alt+M',
    category: 'model',
    scope: 'global',
  },
  {
    action: 'toggleAgent',
    label: 'Toggle Agent',
    description: 'Switch agent mode',
    defaultKey: 'Alt+.',
    currentKey: 'Alt+.',
    category: 'model',
    scope: 'global',
  },
  {
    action: 'toggleVariant',
    label: 'Toggle Thinking Effort',
    description: 'Cycle model thinking effort or variant',
    defaultKey: 'Alt+Shift+M',
    currentKey: 'Alt+Shift+M',
    category: 'model',
    scope: 'global',
  },

  // Message
  {
    action: 'sendMessage',
    label: 'Send Message',
    description: 'Send current message',
    defaultKey: 'Ctrl+Enter',
    currentKey: 'Ctrl+Enter',
    category: 'message',
    scope: 'global',
  },
  {
    action: 'cancelMessage',
    label: 'Cancel Message',
    description: 'Cancel current response',
    defaultKey: 'Escape',
    currentKey: 'Escape',
    category: 'message',
    scope: 'global',
  },
  {
    action: 'copyLastResponse',
    label: 'Copy Response',
    description: 'Copy last AI response',
    defaultKey: 'Alt+C',
    currentKey: 'Alt+C',
    category: 'message',
    scope: 'global',
  },

  // Permission
  {
    action: 'toggleFullAuto',
    label: 'Act Without Asking',
    description: 'Toggle auto-approve all actions',
    defaultKey: 'Alt+Y',
    currentKey: 'Alt+Y',
    category: 'permission',
    scope: 'global',
  },

  // Pane
  {
    action: 'focusNextPane',
    label: 'Focus Next Pane',
    description: 'Move focus to the next pane',
    defaultKey: 'Alt+ArrowRight',
    currentKey: 'Alt+ArrowRight',
    category: 'pane',
    scope: 'global',
  },
  {
    action: 'focusPrevPane',
    label: 'Focus Previous Pane',
    description: 'Move focus to the previous pane',
    defaultKey: 'Alt+ArrowLeft',
    currentKey: 'Alt+ArrowLeft',
    category: 'pane',
    scope: 'global',
  },
  {
    action: 'splitRight',
    label: 'Split Right',
    description: 'Split current pane to the right',
    defaultKey: 'Alt+Shift+ArrowRight',
    currentKey: 'Alt+Shift+ArrowRight',
    category: 'pane',
    scope: 'global',
  },
  {
    action: 'splitDown',
    label: 'Split Down',
    description: 'Split current pane downward',
    defaultKey: 'Alt+Shift+ArrowDown',
    currentKey: 'Alt+Shift+ArrowDown',
    category: 'pane',
    scope: 'global',
  },
  {
    action: 'closePane',
    label: 'Close Pane',
    description: 'Close the focused pane',
    defaultKey: 'Alt+Shift+Backspace',
    currentKey: 'Alt+Shift+Backspace',
    category: 'pane',
    scope: 'global',
  },
  {
    action: 'togglePaneFullscreen',
    label: 'Toggle Pane Fullscreen',
    description: 'Fullscreen or restore the focused pane',
    defaultKey: 'Alt+Enter',
    currentKey: 'Alt+Enter',
    category: 'pane',
    scope: 'global',
  },
]

const TUI_KEYBINDING_OVERRIDES: Partial<Record<KeybindingAction, string>> = {
  commandPalette: 'Ctrl+P',
  toggleAgent: 'Tab',
  toggleVariant: 'Ctrl+T',
  sendMessage: 'Enter',
  cancelMessage: 'Escape',
}

function getPresetDefaultKey(action: KeybindingAction, preset: KeybindingPreset): string {
  const webDefault = DEFAULT_KEYBINDINGS.find(kb => kb.action === action)?.defaultKey ?? ''
  if (preset === 'tui') return TUI_KEYBINDING_OVERRIDES[action] ?? webDefault
  return webDefault
}

function normalizePreset(value: string | null): KeybindingPreset {
  return value === 'tui' ? 'tui' : 'web'
}

/**
 * 规范化按键名称 - 处理各种别名和大小写
 */
function normalizeKeyName(key: string): string {
  const keyLower = key.toLowerCase()

  // 特殊键别名映射
  const aliases: Record<string, string> = {
    esc: 'escape',
    return: 'enter',
    space: ' ',
    spacebar: ' ',
    up: 'arrowup',
    down: 'arrowdown',
    left: 'arrowleft',
    right: 'arrowright',
    del: 'delete',
    ins: 'insert',
    pgup: 'pageup',
    pgdn: 'pagedown',
    pgdown: 'pagedown',
    backquote: '`',
    backtick: '`',
    comma: ',',
    period: '.',
    dot: '.',
    slash: '/',
    backslash: '\\',
    minus: '-',
    dash: '-',
    equal: '=',
    equals: '=',
    plus: '+',
    semicolon: ';',
    quote: "'",
    singlequote: "'",
    doublequote: '"',
    bracketleft: '[',
    bracketright: ']',
  }

  return aliases[keyLower] || keyLower
}

/**
 * 解析快捷键字符串
 * 格式: "Ctrl+Shift+K" -> { key: 'k', ctrl: true, shift: true, alt: false, meta: false }
 * 支持多种格式: "Ctrl+K", "ctrl+k", "Control+K" 等
 */
export function parseKeybinding(keyStr: string): ParsedKeybinding {
  // 处理 "+" 作为主键的特殊情况 (e.g., "Ctrl++")
  const parts: string[] = []
  let remaining = keyStr

  // 匹配修饰键
  const modifiers = ['ctrl', 'control', 'alt', 'shift', 'meta', 'cmd', 'command', 'win']

  while (remaining.includes('+')) {
    const plusIndex = remaining.indexOf('+')
    const part = remaining.substring(0, plusIndex)

    if (part.length > 0) {
      parts.push(part)
      remaining = remaining.substring(plusIndex + 1)
    } else {
      // 空字符串意味着 "+" 在开头或连续 "++"
      // 检查是否 "+" 是主键
      if (remaining.length === 1 || !modifiers.includes(remaining.substring(1).split('+')[0].toLowerCase())) {
        parts.push('+')
        remaining = remaining.substring(1)
        break
      }
      remaining = remaining.substring(1)
    }
  }

  if (remaining.length > 0) {
    parts.push(remaining)
  }

  const result: ParsedKeybinding = {
    key: '',
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
  }

  for (const part of parts) {
    const lower = part.toLowerCase()
    if (lower === 'ctrl' || lower === 'control') {
      result.ctrl = true
    } else if (lower === 'alt' || lower === 'option') {
      result.alt = true
    } else if (lower === 'shift') {
      result.shift = true
    } else if (lower === 'meta' || lower === 'cmd' || lower === 'command' || lower === 'win' || lower === 'super') {
      result.meta = true
    } else {
      // 主键 - 规范化
      result.key = normalizeKeyName(part)
    }
  }

  return result
}

/**
 * 将 ParsedKeybinding 规范化为标准字符串格式 (用于比较)
 * 顺序: Ctrl+Alt+Shift+Meta+Key
 */
export function normalizeKeybindingString(keyStr: string): string {
  const parsed = parseKeybinding(keyStr)
  return keybindingToNormalizedString(parsed)
}

/**
 * 将 ParsedKeybinding 转换为规范化字符串
 */
function keybindingToNormalizedString(parsed: ParsedKeybinding): string {
  const parts: string[] = []
  if (parsed.ctrl) parts.push('ctrl')
  if (parsed.alt) parts.push('alt')
  if (parsed.shift) parts.push('shift')
  if (parsed.meta) parts.push('meta')
  parts.push(parsed.key)
  return parts.join('+')
}

/**
 * 格式化快捷键为显示字符串 (用户友好的格式)
 */
export function formatKeybinding(parsed: ParsedKeybinding): string {
  const parts: string[] = []
  if (parsed.ctrl) parts.push('Ctrl')
  if (parsed.alt) parts.push('Alt')
  if (parsed.shift) parts.push('Shift')
  if (parsed.meta) parts.push('⌘')

  // 格式化主键为用户友好的显示
  let keyDisplay = parsed.key
  const keyDisplayMap: Record<string, string> = {
    arrowup: '↑',
    arrowdown: '↓',
    arrowleft: '←',
    arrowright: '→',
    backspace: '⌫',
    delete: 'Del',
    escape: 'Esc',
    enter: '↵',
    ' ': 'Space',
    tab: 'Tab',
    capslock: 'Caps',
    pageup: 'PGUP',
    pagedown: 'PGDN',
    home: 'Home',
    end: 'End',
    insert: 'Ins',
    '`': '`',
    '-': '-',
    '=': '=',
    '[': '[',
    ']': ']',
    '\\': '\\',
    ';': ';',
    "'": "'",
    ',': ',',
    '.': '.',
    '/': '/',
  }

  if (keyDisplayMap[keyDisplay]) {
    keyDisplay = keyDisplayMap[keyDisplay]
  } else if (keyDisplay.length === 1) {
    keyDisplay = keyDisplay.toUpperCase()
  } else if (keyDisplay.startsWith('f') && /^f\d{1,2}$/.test(keyDisplay)) {
    // F1-F12
    keyDisplay = keyDisplay.toUpperCase()
  }

  parts.push(keyDisplay)
  return parts.join(' + ')
}

/**
 * 格式化快捷键为紧凑字符串 (用于存储)
 */
export function formatKeybindingCompact(parsed: ParsedKeybinding): string {
  const parts: string[] = []
  if (parsed.ctrl) parts.push('Ctrl')
  if (parsed.alt) parts.push('Alt')
  if (parsed.shift) parts.push('Shift')
  if (parsed.meta) parts.push('Meta')

  // 主键首字母大写或特殊格式
  let keyStr = parsed.key
  if (keyStr === 'arrowup') keyStr = 'ArrowUp'
  else if (keyStr === 'arrowdown') keyStr = 'ArrowDown'
  else if (keyStr === 'arrowleft') keyStr = 'ArrowLeft'
  else if (keyStr === 'arrowright') keyStr = 'ArrowRight'
  else if (keyStr === 'backspace') keyStr = 'Backspace'
  else if (keyStr === 'escape') keyStr = 'Escape'
  else if (keyStr === 'enter') keyStr = 'Enter'
  else if (keyStr === ' ') keyStr = 'Space'
  else if (keyStr === 'delete') keyStr = 'Delete'
  else if (keyStr === 'tab') keyStr = 'Tab'
  else if (keyStr.length === 1) keyStr = keyStr.toUpperCase()
  else if (keyStr.startsWith('f') && /^f\d{1,2}$/.test(keyStr)) {
    keyStr = keyStr.toUpperCase()
  }

  parts.push(keyStr)
  return parts.join('+')
}

/**
 * 从 KeyboardEvent 生成快捷键字符串
 */
export function keyEventToString(e: KeyboardEvent): string {
  // 规范化 key 名称
  const key = normalizeKeyName(e.key)

  const parsed: ParsedKeybinding = {
    key,
    ctrl: e.ctrlKey,
    alt: e.altKey,
    shift: e.shiftKey,
    meta: e.metaKey,
  }
  return formatKeybindingCompact(parsed)
}

/**
 * 检查 KeyboardEvent 是否匹配快捷键
 */
export function matchesKeybinding(e: KeyboardEvent, keyStr: string): boolean {
  const parsed = parseKeybinding(keyStr)
  const eventKey = normalizeKeyName(e.key)

  return (
    eventKey === parsed.key &&
    e.ctrlKey === parsed.ctrl &&
    e.altKey === parsed.alt &&
    e.shiftKey === parsed.shift &&
    e.metaKey === parsed.meta
  )
}

/**
 * 比较两个快捷键字符串是否相同 (规范化后比较)
 */
export function keybindingsEqual(a: string, b: string): boolean {
  return normalizeKeybindingString(a) === normalizeKeybindingString(b)
}

export interface KeybindingBackup {
  customKeys: Record<string, string>
}

/**
 * Keybinding Store
 */
class KeybindingStore {
  private keybindings: KeybindingConfig[] = []
  private listeners: Set<Listener> = new Set()
  private preset: KeybindingPreset = 'web'
  private customActions: Set<KeybindingAction> = new Set()

  // 快照缓存 (用于 useSyncExternalStore)
  private _snapshot: KeybindingConfig[] = []

  constructor() {
    this.loadFromStorage()
    this.updateSnapshot()
  }

  // ============================================
  // Storage
  // ============================================

  private loadFromStorage(): void {
    this.preset = normalizePreset(localStorage.getItem(STORAGE_KEY_PRESET))

    // 先加载默认配置
    this.keybindings = DEFAULT_KEYBINDINGS.map(kb => {
      const defaultKey = getPresetDefaultKey(kb.action, this.preset)
      return { ...kb, defaultKey, currentKey: defaultKey }
    })

    // 然后应用用户自定义
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const customKeys: Record<string, string> = JSON.parse(stored)
        this.customActions = new Set(
          Object.keys(customKeys).filter((action): action is KeybindingAction =>
            DEFAULT_KEYBINDINGS.some(kb => kb.action === action),
          ),
        )
        for (const kb of this.keybindings) {
          if (customKeys[kb.action]) {
            kb.currentKey = customKeys[kb.action]
          }
        }
      }
    } catch {
      // ignore
    }
  }

  private saveToStorage(): void {
    try {
      // 只保存与默认不同的配置
      const customKeys: Record<string, string> = {}
      for (const kb of this.keybindings) {
        if (this.customActions.has(kb.action)) {
          customKeys[kb.action] = kb.currentKey
        }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customKeys))
    } catch {
      // ignore
    }
  }

  // ============================================
  // Subscription
  // ============================================

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    this.updateSnapshot()
    this.listeners.forEach(l => l())
  }

  private updateSnapshot(): void {
    this._snapshot = this.keybindings.map(kb => ({ ...kb }))
  }

  // ============================================
  // Getters
  // ============================================

  /**
   * 获取所有快捷键配置 (返回缓存快照)
   */
  getAll(): KeybindingConfig[] {
    return this._snapshot
  }

  getPreset(): KeybindingPreset {
    return this.preset
  }

  /**
   * 按分类获取快捷键
   */
  getByCategory(category: KeybindingConfig['category']): KeybindingConfig[] {
    return this.keybindings.filter(kb => kb.category === category)
  }

  /**
   * 获取某个动作的快捷键
   */
  getKeybinding(action: KeybindingAction): KeybindingConfig | undefined {
    return this.keybindings.find(kb => kb.action === action)
  }

  /**
   * 获取某个动作的当前快捷键字符串
   */
  getKey(action: KeybindingAction): string {
    return this.getKeybinding(action)?.currentKey ?? ''
  }

  /**
   * 检查快捷键是否已被使用 (使用规范化比较)
   */
  isKeyUsed(keyStr: string, excludeAction?: KeybindingAction, scope?: KeybindingConfig['scope']): boolean {
    const normalizedInput = normalizeKeybindingString(keyStr)
    return this.keybindings.some(
      kb =>
        normalizeKeybindingString(kb.currentKey) === normalizedInput &&
        kb.action !== excludeAction &&
        (scope === undefined || kb.scope === scope),
    )
  }

  /**
   * 根据快捷键查找动作 (使用规范化比较)
   */
  findActionByKey(keyStr: string, scope?: KeybindingConfig['scope']): KeybindingAction | null {
    const normalizedInput = normalizeKeybindingString(keyStr)
    const kb = this.keybindings.find(
      k => normalizeKeybindingString(k.currentKey) === normalizedInput && (scope === undefined || k.scope === scope),
    )
    return kb?.action ?? null
  }

  findMatchingAction(event: KeyboardEvent, scope: KeybindingConfig['scope']): KeybindingAction | null {
    const kb = this.keybindings.find(k => k.scope === scope && matchesKeybinding(event, k.currentKey))
    return kb?.action ?? null
  }

  // ============================================
  // Mutations
  // ============================================

  /**
   * 设置快捷键
   */
  setKeybinding(action: KeybindingAction, newKey: string): boolean {
    const kb = this.keybindings.find(k => k.action === action)
    if (!kb) return false

    kb.currentKey = newKey
    this.customActions.add(action)
    this.saveToStorage()
    this.notify()
    return true
  }

  setPreset(preset: KeybindingPreset): void {
    if (this.preset === preset) return
    const previousPreset = this.preset

    for (const kb of this.keybindings) {
      const previousDefault = getPresetDefaultKey(kb.action, previousPreset)
      const nextDefault = getPresetDefaultKey(kb.action, preset)
      const isCustom = this.customActions.has(kb.action)
      const followsPreviousPreset = !isCustom && keybindingsEqual(kb.currentKey, previousDefault)
      const collidesWithCustom = this.keybindings.some(
        other =>
          other.action !== kb.action &&
          other.scope === kb.scope &&
          this.customActions.has(other.action) &&
          keybindingsEqual(other.currentKey, nextDefault),
      )

      kb.defaultKey = nextDefault
      if (followsPreviousPreset && !collidesWithCustom) {
        kb.currentKey = nextDefault
      } else if (followsPreviousPreset && collidesWithCustom) {
        this.customActions.add(kb.action)
      }
    }

    this.preset = preset
    localStorage.setItem(STORAGE_KEY_PRESET, preset)
    this.saveToStorage()
    this.notify()
  }

  /**
   * 重置单个快捷键为默认值
   */
  resetKeybinding(action: KeybindingAction): boolean {
    const kb = this.keybindings.find(k => k.action === action)
    if (!kb) return false

    kb.currentKey = kb.defaultKey
    this.customActions.delete(action)
    this.saveToStorage()
    this.notify()
    return true
  }

  /**
   * 重置所有快捷键为默认值
   */
  resetAll(): void {
    for (const kb of this.keybindings) {
      kb.currentKey = kb.defaultKey
    }
    this.customActions.clear()
    this.saveToStorage()
    this.notify()
  }
}

// 单例导出
export const keybindingStore = new KeybindingStore()

export function exportKeybindingBackup(): KeybindingBackup {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return { customKeys: {} }

  try {
    const customKeys = JSON.parse(stored)
    if (!customKeys || typeof customKeys !== 'object') return { customKeys: {} }
    return { customKeys: customKeys as Record<string, string> }
  } catch {
    return { customKeys: {} }
  }
}

export function importKeybindingBackup(raw: unknown): void {
  const parsed = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined
  const nextCustomKeys = parsed?.customKeys && typeof parsed.customKeys === 'object' ? parsed.customKeys : {}

  keybindingStore.resetAll()

  for (const keybinding of DEFAULT_KEYBINDINGS) {
    const customKey = (nextCustomKeys as Record<string, unknown>)[keybinding.action]
    if (typeof customKey === 'string' && customKey.trim()) {
      keybindingStore.setKeybinding(keybinding.action, customKey)
    }
  }
}
