import { createElement, forwardRef } from 'react'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatPane } from './ChatPane'

const { chatAreaProps, retrySessionLoadMock } = vi.hoisted(() => ({
  chatAreaProps: { current: null as Record<string, unknown> | null },
  retrySessionLoadMock: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  Trans: ({ children }: { children: unknown }) => children,
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('.', async () => {
  return {
    ChatArea: forwardRef((props, _ref) => {
      chatAreaProps.current = props as Record<string, unknown>
      return createElement('div')
    }),
    Header: () => null,
    InputBox: () => null,
    PermissionDialog: () => null,
    QuestionDialog: () => null,
  }
})

vi.mock('../../components/OutlineIndex', () => ({ OutlineIndex: () => null }))
vi.mock('./PaneHeader', () => ({ PaneHeader: () => null }))
vi.mock('./PaneDropOverlay', () => ({
  PaneDropOverlay: forwardRef(() => null),
  resolveDropZone: () => 'center',
}))
vi.mock('./chatViewport', () => ({
  ChatViewportProvider: ({ children }: { children: unknown }) => children,
  canUseSplitPane: () => true,
  useChatViewportMaybe: () => null,
}))
vi.mock('./useChatPageViewModel', () => ({
  useChatPageViewModel: () => ({
    pageRecords: [],
    visibleMessages: [],
    forkTargetIdMap: new Map(),
    turnDurationMap: new Map(),
    outlineSourceEntries: [],
    outlineOwnerByMessageId: new Map(),
  }),
}))
vi.mock('../../hooks', () => ({
  useChatSession: () => ({
    messages: [],
    isStreaming: false,
    canUndo: false,
    canRedo: false,
    redoSteps: 0,
    revertedContent: null,
    restoredContent: null,
    agents: [],
    selectedAgent: '',
    setSelectedAgent: vi.fn(),
    routeSessionId: 'session-1',
    routeStatus: undefined,
    loadState: 'error',
    loadError: undefined,
    hasMoreHistory: true,
    historyPaginationMode: 'legacy',
    isLoadingHistory: false,
    historyLoadError: undefined,
    retryStatus: null,
    effectiveDirectory: '/workspace/demo',
    pendingPermissionRequests: [],
    pendingQuestionRequests: [],
    handlePermissionReply: vi.fn(),
    handleQuestionReply: vi.fn(),
    handleQuestionReject: vi.fn(),
    isReplying: false,
    loadMoreHistory: vi.fn(),
    retrySessionLoad: retrySessionLoadMock,
    handleRedoAll: vi.fn(),
    clearRevert: vi.fn(),
    registerMessage: vi.fn(),
    registerInputBox: vi.fn(),
    handleSend: vi.fn(),
    handleAbort: vi.fn(),
    handleCommand: vi.fn(),
    handleUndoWithAnimation: vi.fn(),
    handleRedoWithAnimation: vi.fn(),
    handleForkMessage: vi.fn(),
    handleNewSession: vi.fn(),
    handleVisibleMessageIdsChange: vi.fn(),
    handleArchiveSession: vi.fn(),
    handlePreviousSession: vi.fn(),
    handleNextSession: vi.fn(),
    handleCopyLastResponse: vi.fn(),
    restoreAgentFromMessage: vi.fn(),
  }),
  useModels: () => ({ models: [], isLoading: false, refetch: vi.fn() }),
  useModelSelection: () => ({
    selectedModelKey: '',
    selectedVariant: undefined,
    currentModel: undefined,
    handleModelChange: vi.fn(),
    handleVariantChange: vi.fn(),
    restoreFromMessage: vi.fn(),
  }),
}))
vi.mock('../../hooks/useServerStore', () => ({ useServerStore: () => ({ activeServer: null, getHealth: vi.fn() }) }))
vi.mock('../../hooks/useCancelHint', () => ({ useCancelHint: () => ({ showCancelHint: false, handleCancelMessage: vi.fn() }) }))
vi.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ inlineToolRequests: false, outlineCurrentHighlight: false }) }))
vi.mock('../../store', () => ({
  messageStore: { protectSession: vi.fn(), unprotectSession: vi.fn() },
  paneControllerStore: { setController: vi.fn(), removeController: vi.fn() },
  useHiddenModelKeys: () => [],
}))
vi.mock('../../store/paneLayoutStore', () => ({
  paneLayoutStore: { focusPane: vi.fn(), getFocusedPaneId: vi.fn(), findLeaf: vi.fn(), splitPaneToSide: vi.fn() },
}))
vi.mock('../../store/autoApproveStore', () => ({
  autoApproveStore: { onFullAutoChange: () => vi.fn(), cyclePaneFullAutoMode: vi.fn() },
}))
vi.mock('../../utils/sessionHelpers', () => ({ restoreModelSelection: () => null }))
vi.mock('../../utils/modelUtils', () => ({ findModelByKey: () => undefined, getModelKey: () => '' }))
vi.mock('../../lib/internalDragCore', () => ({
  getInternalDragSnapshot: () => ({ active: null }),
  subscribeInternalDrag: () => vi.fn(),
  subscribeInternalDrop: () => vi.fn(),
}))
vi.mock('../../components/ErrorBoundary', () => ({ ErrorBoundary: ({ children }: { children: unknown }) => children }))
vi.mock('./WorkingStatusBar', () => ({ WorkingStatusBar: () => null }))
vi.mock('./workingStatus', () => ({ getWorkingStatus: () => null }))

describe('ChatPane history recovery wiring', () => {
  beforeEach(() => {
    chatAreaProps.current = null
    retrySessionLoadMock.mockReset()
  })

  it('passes retry and legacy pagination state to ChatArea', () => {
    render(
      createElement(ChatPane, {
        paneId: 'pane-1',
        sessionId: 'session-1',
        isFocused: true,
        paneCount: 1,
        displayMode: 'single',
        navigatePaneToSession: vi.fn(),
        navigatePaneHome: vi.fn(),
      }),
    )

    expect(chatAreaProps.current).toMatchObject({
      onRetrySession: retrySessionLoadMock,
      historyPaginationMode: 'legacy',
    })
  })
})
