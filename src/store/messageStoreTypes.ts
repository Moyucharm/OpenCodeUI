// ============================================
// MessageStore Types
// ============================================

import type { Message, MessageError, Part } from '../types/message'
import type { ApiSession } from '../api/types'

export type HistoryPaginationMode = 'unknown' | 'cursor' | 'legacy'

export interface RevertState {
  /** 撤销点的消息 ID */
  messageId: string
  /** 撤销历史栈 - 用于多步 redo */
  history: RevertHistoryItem[]
}

export interface RevertHistoryItem {
  messageId: string
  text: string
  attachments: unknown[]
  model?: { providerID: string; modelID: string; variant?: string }
  variant?: string
  agent?: string
}

export interface SessionState {
  /** 所有消息（包括被撤销的） */
  messages: Message[]
  /** 撤销状态 */
  revertState: RevertState | null
  /** 是否正在 streaming */
  isStreaming: boolean
  /** 加载状态 */
  loadState: 'idle' | 'loading' | 'loaded' | 'error'
  /** 空会话加载失败时展示在消息流里的错误 */
  loadError?: MessageError
  /** 是否还有更多历史消息 */
  hasMoreHistory: boolean
  /** 下一页更早历史消息的游标 */
  historyCursor?: string
  /** 历史分页协议模式 */
  paginationMode: HistoryPaginationMode
  /** 是否正在加载更早的历史消息 */
  isLoadingHistory: boolean
  /** 加载更早历史消息失败时展示的错误 */
  historyLoadError?: MessageError
  /** 当前历史请求的单调世代，用于丢弃陈旧响应 */
  historyGeneration: number
  /** 尚未加载到内存的服务端撤销点 */
  pendingRevertState?: ApiSession['revert']
  /** 本地撤销状态的单调世代，用于拒绝过期的 session 元数据 */
  localRevertGeneration: number
  /** session 目录 */
  directory: string
  /** session 标题 */
  title?: string
  /** 分享链接 */
  shareUrl?: string
  /** 断线重连后是否需要重新全量拉取 */
  isStale: boolean
}

export interface SendRollbackSnapshot {
  messages: Message[]
  revertState: RevertState | null
}

export interface MessageStoreSnapshot {
  sessionId: string | null
  messages: Message[]
  isStreaming: boolean
  revertState: RevertState | null
  hasMoreHistory: boolean
  sessionDirectory: string
  sessionTitle: string
  shareUrl: string | undefined
  canUndo: boolean
  canRedo: boolean
  redoSteps: number
  revertedContent: RevertHistoryItem | null
  loadState: SessionState['loadState']
  loadError?: MessageError
}

export interface SessionStateSnapshot {
  messages: Message[]
  isStreaming: boolean
  loadState: SessionState['loadState']
  loadError?: MessageError
  revertState: RevertState | null
  canUndo: boolean
  canRedo: boolean
  redoSteps: number
  revertedContent: RevertHistoryItem | null
  hasMoreHistory: boolean
  historyPaginationMode: HistoryPaginationMode
  isLoadingHistory: boolean
  historyLoadError?: MessageError
  directory: string
  title: string | null
}

// Re-export Part for convenience
export type { Message, Part }
