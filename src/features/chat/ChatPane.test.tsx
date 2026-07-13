import { createElement, forwardRef } from 'react'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatPane } from './ChatPane'

const chatAreaProps = { current: null as Record<string, unknown> | null }
const retrySessionLoadMock = vi.fn()
const restoreAgentFromMessageMock = vi.fn()
const chatSessionInputs = {
  messages: [] as unknown[],
  agents: [] as unknown[],
  selectedAgent: '',
  commandSessionId: null as string | null,
  routeSessionId: 'session-1',
}

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
    messages: chatSessionInputs.messages,
    isStreaming: false,
    canUndo: false,
    canRedo: false,
    redoSteps: 0,
    revertedContent: null,
    restoredContent: null,
    agents: chatSessionInputs.agents,
    selectedAgent: chatSessionInputs.selectedAgent,
    commandSessionId: chatSessionInputs.commandSessionId,
    setSelectedAgent: vi.fn(),
    routeSessionId: chatSessionInputs.routeSessionId,
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
    restoreAgentFromMessage: restoreAgentFromMessageMock,
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
vi.mock('../../hooks/useCancelHint', () => ({
  useCancelHint: () => ({ showCancelHint: false, handleCancelMessage: vi.fn() }),
}))
vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ inlineToolRequests: false, outlineCurrentHighlight: false }),
}))
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
    restoreAgentFromMessageMock.mockReset()
    chatSessionInputs.messages = []
    chatSessionInputs.agents = []
    chatSessionInputs.selectedAgent = ''
    chatSessionInputs.commandSessionId = null
    chatSessionInputs.routeSessionId = 'session-1'
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

  it('does not restore the agent from a command-generated user message', () => {
    chatSessionInputs.agents = [{ name: 'build', mode: 'primary', hidden: false }]
    chatSessionInputs.messages = [{ info: { role: 'user', agent: 'build' } }]
    chatSessionInputs.selectedAgent = 'plan'
    chatSessionInputs.commandSessionId = 'session-1'

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

    expect(restoreAgentFromMessageMock).not.toHaveBeenCalled()
  })

  it('restores the agent again after leaving and reopening a session', () => {
    chatSessionInputs.agents = [
      { name: 'plan', mode: 'primary', hidden: false },
      { name: 'build', mode: 'primary', hidden: false },
    ]
    chatSessionInputs.messages = [{ info: { role: 'user', agent: 'plan' } }]

    const { rerender } = render(
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
    expect(restoreAgentFromMessageMock).toHaveBeenCalledWith('plan')

    restoreAgentFromMessageMock.mockClear()
    chatSessionInputs.routeSessionId = 'session-2'
    chatSessionInputs.messages = []
    rerender(
      createElement(ChatPane, {
        paneId: 'pane-1',
        sessionId: 'session-2',
        isFocused: true,
        paneCount: 1,
        displayMode: 'single',
        navigatePaneToSession: vi.fn(),
        navigatePaneHome: vi.fn(),
      }),
    )

    chatSessionInputs.routeSessionId = 'session-1'
    chatSessionInputs.messages = [{ info: { role: 'user', agent: 'build' } }]
    rerender(
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

    expect(restoreAgentFromMessageMock).toHaveBeenCalledWith('build')
  })

  it('waits for a user message before marking agent restoration complete', () => {
    chatSessionInputs.agents = [{ name: 'build', mode: 'primary', hidden: false }]
    chatSessionInputs.messages = [{ info: { role: 'assistant' } }]

    const { rerender } = render(
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
    expect(restoreAgentFromMessageMock).not.toHaveBeenCalled()

    chatSessionInputs.messages = [{ info: { role: 'assistant' } }, { info: { role: 'user', agent: 'build' } }]
    rerender(
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

    expect(restoreAgentFromMessageMock).toHaveBeenCalledWith('build')
  })
})
