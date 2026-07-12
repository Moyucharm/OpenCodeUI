// ============================================
// useSessionManager - Session 加载和状态管理
// ============================================
//
// 职责：
// 1. 加载 session 消息（初始加载 + 懒加载历史）
// 2. 处理 undo/redo（调用 API + 更新 store）
// 3. 只管理单个 session 的加载状态，不再承担全局当前 session 同步

import { useCallback, useEffect, useRef } from 'react'
import { logger } from '../utils/logger'
import { isUserUIMessage, toApiMessageWithParts } from '../utils/messageConversion'
import { messageStore, type RevertState, type SessionState } from '../store'
import {
  getSessionMessagePage,
  getSession,
  revertMessage,
  unrevertSession,
  extractUserMessageContent,
  type ApiMessageWithParts,
} from '../api'
import { sessionErrorHandler } from '../utils'
import { isSessionNotFoundError } from '../utils/sessionErrors'
import { INITIAL_MESSAGE_LIMIT, HISTORY_LOAD_BATCH_SIZE } from '../constants'
import type { MessageError } from '../types/message'

const INITIAL_MESSAGE_REQUEST_TIMEOUT_MS = 30_000
const loadGenerationBySession = new Map<string, number>()
let loadGenerationEpoch = 0

export function invalidateSessionLoads() {
  loadGenerationEpoch += 1
  loadGenerationBySession.clear()
}

function toLoadMessageError(error: unknown): MessageError {
  const message = error instanceof Error ? error.message : String(error || 'Failed to load session')
  return {
    name: 'APIError',
    data: {
      message,
      isRetryable: true,
      responseBody: error instanceof Error ? error.stack : undefined,
    },
  }
}

interface UseSessionManagerOptions {
  sessionId: string | null
  directory?: string // 当前项目目录
  onLoadComplete?: () => void
  onError?: (error: Error) => void
  onSessionMissing?: (sessionId: string) => void
}

function mergeWithLocalStreamingMessages(
  apiMessages: ApiMessageWithParts[],
  localState?: SessionState,
): ApiMessageWithParts[] {
  if (!localState?.isStreaming || localState.messages.length === 0) return apiMessages

  const localById = new Map(localState.messages.map(message => [message.info.id, message]))
  const apiIds = new Set(apiMessages.map(m => m.info.id))
  const localOnly = localState.messages.filter(m => !apiIds.has(m.info.id)).map(toApiMessageWithParts)

  const mergedApiMessages = apiMessages.map(message => {
    const localMessage = localById.get(message.info.id)
    return localMessage?.isStreaming ? toApiMessageWithParts(localMessage) : message
  })

  if (localOnly.length === 0) return mergedApiMessages

  return [...mergedApiMessages, ...localOnly].sort((a, b) => {
    const aCreated = a.info.time?.created ?? 0
    const bCreated = b.info.time?.created ?? 0
    return aCreated - bCreated
  })
}

type MessagePageOptions = Omit<Parameters<typeof getSessionMessagePage>[1], 'signal'>

async function getMessagePageWithTimeout(sessionId: string, options: MessagePageOptions) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort(new Error('Timed out loading session messages'))
  }, INITIAL_MESSAGE_REQUEST_TIMEOUT_MS)

  try {
    return await getSessionMessagePage(sessionId, {
      ...options,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

function getInitialMessagePage(sessionId: string, directory?: string) {
  return getMessagePageWithTimeout(sessionId, {
    directory,
    limit: INITIAL_MESSAGE_LIMIT,
  })
}

export function useSessionManager({ sessionId, directory, onLoadComplete, onError, onSessionMissing }: UseSessionManagerOptions) {
  const loadSessionRef = useRef<(sid: string, options?: { force?: boolean }) => Promise<void>>(async () => {})

  // 使用 ref 保存 directory，避免依赖变化
  const directoryRef = useRef(directory)

  useEffect(() => {
    directoryRef.current = directory
  }, [directory])

  // ============================================
  // Load Session
  // ============================================

  const loadSession = useCallback(
    async (sid: string, options?: { force?: boolean }) => {
      const force = options?.force ?? false

      const epoch = loadGenerationEpoch
      const generation = (loadGenerationBySession.get(sid) ?? 0) + 1
      loadGenerationBySession.set(sid, generation)
      const isStale = () => loadGenerationEpoch !== epoch || loadGenerationBySession.get(sid) !== generation

      const dir = directoryRef.current

      // 检查是否已有消息（SSE 可能已经推送了）
      const existingState = messageStore.getSessionState(sid)
      const hasExistingMessages = existingState && existingState.messages.length > 0
      const hasLoadedBaseline = existingState?.loadState === 'loaded' && !existingState?.isStale

      // 如果已经有消息且正在 streaming，不能覆盖消息，但仍需加载元数据
      // 仅在「已经完整加载过」时才跳过覆盖；
      // 对于仅靠 SSE 暂存出来的 session（loadState=idle），仍要做一次完整拉取
      // force 模式下也不覆盖正在 streaming 且已加载的消息
      if (hasExistingMessages && existingState.isStreaming && hasLoadedBaseline && !force) {
        // 已有完整基线时只刷新元数据，避免影响流式消息和已加载的历史分页状态。
        messageStore.invalidateHistoryLoad(sid)
        const initialRevertState = existingState.revertState
        void getSession(sid, dir)
          .then(sessionInfo => {
            if (isStale()) return
            const currentState = messageStore.getSessionState(sid)
            messageStore.updateSessionMetadata(sid, {
              directory: sessionInfo.directory ?? dir ?? '',
              title: sessionInfo.title,
              shareUrl: sessionInfo.share?.url,
              ...(currentState?.revertState === initialRevertState ? { revertState: sessionInfo.revert ?? null } : {}),
            })
          })
          .catch(() => {
            // 元数据加载失败不影响 streaming，静默忽略
          })
        if (!isStale()) {
          onLoadComplete?.()
        }
        return
      }

      messageStore.setLoadState(sid, 'loading')

      try {
        let sessionInfo: Awaited<ReturnType<typeof getSession>> | null = null
        const loadState = { appliedRevertState: undefined as RevertState | null | undefined }
        const getLoadedSessionInfo = () => sessionInfo
        const sessionInfoPromise = getSession(sid, dir).then(
          info => {
            sessionInfo = info
            return info
          },
          () => null,
        )

        // 元数据请求不能阻塞消息页；完成后再单独更新元数据。
        void sessionInfoPromise.then(info => {
          if (isStale() || !info) return
          const currentState = messageStore.getSessionState(sid)
          messageStore.updateSessionMetadata(sid, {
            directory: info.directory ?? dir ?? '',
            title: info.title,
            shareUrl: info.share?.url,
            ...(loadState.appliedRevertState === undefined || currentState?.revertState === loadState.appliedRevertState
              ? { revertState: info.revert ?? null }
              : {}),
          })
        })

        const { messages: apiMessages, nextCursor } = await getInitialMessagePage(sid, dir)

        if (isStale()) return

        const currentState = messageStore.getSessionState(sid)
        const loadedSessionInfo = getLoadedSessionInfo()
        const hasCursor = nextCursor !== undefined
        const paginationMode = hasCursor ? 'cursor' : 'legacy'
        const hasMoreHistory = hasCursor || apiMessages.length >= INITIAL_MESSAGE_LIMIT

        if (currentState?.messages.length && (force || currentState.isStale)) {
          // 刷新或 stale 缓存只合并服务器最新快照，保留已向上加载的历史和分页状态。
          messageStore.mergeMessages(sid, apiMessages, {
            preserveHistory: true,
            ...(currentState.isStreaming ? { preserveStreaming: true } : {}),
            ...(loadedSessionInfo ? { revertState: loadedSessionInfo.revert ?? null } : {}),
          })
          messageStore.updateSessionMetadata(sid, {
            ...(loadedSessionInfo
              ? {
                  directory: loadedSessionInfo.directory ?? dir ?? '',
                  title: loadedSessionInfo.title,
                  shareUrl: loadedSessionInfo.share?.url,
                }
              : {}),
          })
        } else {
          const mergedMessages = mergeWithLocalStreamingMessages(apiMessages, currentState)

          // 设置消息到 store
          messageStore.setMessages(sid, mergedMessages, {
            directory: loadedSessionInfo?.directory ?? dir ?? '',
            title: loadedSessionInfo?.title,
            hasMoreHistory,
            historyCursor: nextCursor,
            paginationMode,
            revertState: loadedSessionInfo?.revert ?? null,
            shareUrl: loadedSessionInfo?.share?.url,
            inferStreaming: !!currentState?.isStreaming,
          })
        }

        loadState.appliedRevertState = messageStore.getSessionState(sid)?.revertState ?? null

        // force 模式（如 SSE 重连）只静默刷新数据，不触发滚动
        if (!force) {
          onLoadComplete?.()
        }
      } catch (error) {
        if (isStale()) return
        sessionErrorHandler('load session', error)
        messageStore.setLoadError(sid, toLoadMessageError(error))
        if (isSessionNotFoundError(error)) {
          onSessionMissing?.(sid)
        }
        onError?.(error instanceof Error ? error : new Error(String(error)))
      }
    },
    [onLoadComplete, onError, onSessionMissing],
  )

  // 保持 ref 同步，避免 effect 依赖 loadSession 导致重复触发
  useEffect(() => {
    loadSessionRef.current = loadSession
  }, [loadSession])

  // ============================================
  // Load More History
  // ============================================

  const loadMoreHistory = useCallback(async () => {
    if (!sessionId) return

    const state = messageStore.getSessionState(sessionId)
    if (!state || !state.hasMoreHistory) return

    const dir = state.directory || directoryRef.current
    const useCursor = state.paginationMode === 'cursor'
    if (useCursor && !state.historyCursor) return

    const limit = useCursor
      ? HISTORY_LOAD_BATCH_SIZE
      : Math.max(INITIAL_MESSAGE_LIMIT, state.messages.length) + HISTORY_LOAD_BATCH_SIZE
    const generation = messageStore.beginHistoryLoad(sessionId)
    if (generation === null) return

    try {
      const page = useCursor
        ? await getMessagePageWithTimeout(sessionId, {
            directory: dir,
            limit,
            before: state.historyCursor,
          })
        : await getMessagePageWithTimeout(sessionId, {
            directory: dir,
            limit,
          })

      if (!messageStore.isCurrentHistoryLoad(sessionId, generation)) return

      const latestState = messageStore.getSessionState(sessionId)
      if (!latestState) return

      // 去重 + 按时间排序
      const existingIds = new Set(latestState.messages.map(m => m.info.id))
      const prependCandidates = page.messages
        .filter(m => !existingIds.has(m.info.id))
        .sort((a, b) => (a.info.time?.created ?? 0) - (b.info.time?.created ?? 0))

      const hasCursor = page.nextCursor !== undefined
      const paginationMode = useCursor || hasCursor ? 'cursor' : 'legacy'
      const hasMore = useCursor ? hasCursor : hasCursor || page.messages.length >= limit
      messageStore.prependMessages(sessionId, prependCandidates, hasMore)
      messageStore.completeHistoryLoad(sessionId, generation, {
        historyCursor: page.nextCursor,
        paginationMode,
        hasMoreHistory: hasMore,
      })
    } catch (error) {
      if (!messageStore.isCurrentHistoryLoad(sessionId, generation)) return
      sessionErrorHandler('load more history', error)
      messageStore.failHistoryLoad(sessionId, generation, toLoadMessageError(error))
    }
  }, [sessionId])

  // ============================================
  // Undo
  // ============================================

  const handleUndo = useCallback(
    async (userMessageId: string) => {
      if (!sessionId) return

      // 获取当前 session 的 directory（优先用 store 中的，其次用传入的）
      const state = messageStore.getSessionState(sessionId)
      if (!state) return

      const dir = state.directory || directoryRef.current

      try {
        // 调用 API 设置 revert 点（传递 directory）
        await revertMessage(sessionId, userMessageId, undefined, dir)

        // 找到 revert 点的索引
        const revertIndex = state.messages.findIndex(m => m.info.id === userMessageId)
        if (revertIndex === -1) return

        // 收集被撤销的用户消息，构建 redo 历史
        const revertedUserMessages = state.messages.slice(revertIndex).filter(isUserUIMessage)

        const history = revertedUserMessages.map(m => {
          const content = extractUserMessageContent(m)
          const userInfo = m.info
          return {
            messageId: m.info.id,
            text: content.text,
            attachments: content.attachments,
            model: userInfo.model,
            variant: userInfo.model.variant,
            agent: userInfo.agent,
          }
        })

        // 更新 store 的 revert 状态
        const revertState: RevertState = {
          messageId: userMessageId,
          history,
        }
        messageStore.setRevertState(sessionId, revertState)
      } catch (error) {
        sessionErrorHandler('undo', error)
      }
    },
    [sessionId],
  )

  // ============================================
  // Redo
  // ============================================

  const handleRedo = useCallback(async () => {
    if (!sessionId) return

    const state = messageStore.getSessionState(sessionId)
    if (!state?.revertState) return

    const { history } = state.revertState
    if (history.length === 0) return

    const dir = state.directory || directoryRef.current

    try {
      // 移除第一条历史记录（最早撤销的）
      const newHistory = history.slice(1)

      if (newHistory.length > 0) {
        // 还有更多历史，设置新的 revert 点
        const newRevertMessageId = newHistory[0].messageId
        await revertMessage(sessionId, newRevertMessageId, undefined, dir)

        messageStore.setRevertState(sessionId, {
          messageId: newRevertMessageId,
          history: newHistory,
        })
      } else {
        // 没有更多历史，完全清除 revert 状态
        await unrevertSession(sessionId, dir)
        messageStore.setRevertState(sessionId, null)
      }
    } catch (error) {
      sessionErrorHandler('redo', error)
    }
  }, [sessionId])

  // ============================================
  // Redo All
  // ============================================

  const handleRedoAll = useCallback(async () => {
    if (!sessionId) return

    const state = messageStore.getSessionState(sessionId)
    const dir = state?.directory || directoryRef.current

    try {
      await unrevertSession(sessionId, dir)
      messageStore.setRevertState(sessionId, null)
    } catch (error) {
      sessionErrorHandler('redo all', error)
    }
  }, [sessionId])

  // ============================================
  // Clear Revert
  // ============================================

  const clearRevert = useCallback(() => {
    if (!sessionId) return
    messageStore.setRevertState(sessionId, null)
  }, [sessionId])

  // ============================================
  // Effects
  // ============================================

  // 根据 sessionId 切换缓存视图。
  // focused pane / URL 的同步由 App 顶层统一负责，
  // 这里不再写任何“全局当前 session”状态。
  useEffect(() => {
    if (sessionId) {
      const cached = messageStore.getSessionState(sessionId)
      const canUseCached = !!cached && cached.loadState === 'loaded' && !cached.isStale && cached.messages.length > 0

      if (canUseCached) {
        logger.log('[SessionManager] switch:use-cached', {
          sessionId,
          cachedCount: cached.messages.length,
        })
        return
      }

      logger.log('[SessionManager] switch:fetch-session', { sessionId })
      void loadSessionRef.current(sessionId)
    }
  }, [sessionId])

  return {
    loadSession,
    loadMoreHistory,
    handleUndo,
    handleRedo,
    handleRedoAll,
    clearRevert,
  }
}
