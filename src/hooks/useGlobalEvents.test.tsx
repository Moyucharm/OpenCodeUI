import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerSessionConsumer, useGlobalEvents } from './useGlobalEvents'

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

const {
  subscribeToEventsMock,
  getSessionStatusMock,
  getPendingPermissionsMock,
  getPendingQuestionsMock,
  replyPermissionMock,
  childBelongsToSessionMock,
  getFocusedSessionIdMock,
  getSessionAndDescendantsMock,
  notificationPushMock,
  playNotificationSoundMock,
  playNotificationSoundDedupedMock,
  getSoundSnapshotMock,
  isSystemEnabledMock,
  activeSessionStoreMock,
  applyServerConnectedTimestampMock,
  getActiveServerIdMock,
  checkHealthMock,
  onServerChangeMock,
  autoApproveStoreMock,
  clearSessionRuntimeStateMock,
  clearPaneSessionMock,
  getChildSessionInfoMock,
  isChildSessionCompletionEnabledMock,
  sendSystemNotificationMock,
  hasPendingRequestMock,
  requestTaskbarAttentionMock,
} = vi.hoisted(() => {
  const hasPendingRequestMock = vi.fn<(requestId: string) => boolean>(() => true)

  return {
    subscribeToEventsMock: vi.fn(),
    getSessionStatusMock: vi.fn<(directory?: string) => Promise<Record<string, { type: string }>>>(() => Promise.resolve({})),
    getPendingPermissionsMock: vi.fn(() =>
      Promise.resolve([] as Array<{ id: string; sessionID: string; permission: string; patterns?: string[] }>),
    ),
    getPendingQuestionsMock: vi.fn(() => Promise.resolve([])),
    replyPermissionMock: vi.fn(() => Promise.resolve()),
    childBelongsToSessionMock: vi.fn<(sessionId: string, rootSessionId: string) => boolean>(() => false),
    getFocusedSessionIdMock: vi.fn<() => string | null>(() => null),
    getSessionAndDescendantsMock: vi.fn((sessionId: string) => [sessionId]),
    notificationPushMock: vi.fn(),
    playNotificationSoundMock: vi.fn(),
    playNotificationSoundDedupedMock: vi.fn(),
    isSystemEnabledMock: vi.fn((type: string) => type !== 'permission'),
    applyServerConnectedTimestampMock: vi.fn(),
    getActiveServerIdMock: vi.fn(() => 'local'),
    checkHealthMock: vi.fn(() => Promise.resolve({ status: 'online' })),
    onServerChangeMock: vi.fn((_listener: (serverId: string) => void) => vi.fn()),
    clearSessionRuntimeStateMock: vi.fn(),
    clearPaneSessionMock: vi.fn(),
    getChildSessionInfoMock: vi.fn(),
    isChildSessionCompletionEnabledMock: vi.fn(() => false),
    sendSystemNotificationMock: vi.fn(),
    hasPendingRequestMock,
    requestTaskbarAttentionMock: vi.fn(),
    getSoundSnapshotMock: vi.fn(() => ({
      currentSessionEnabled: true,
    })),
    activeSessionStoreMock: {
      initialize: vi.fn(),
      initializePendingRequests: vi.fn(),
      mergeStatusRefresh: vi.fn(),
      mergePendingRequests: vi.fn(),
      setSessionMetaBulk: vi.fn(),
      setSessionMeta: vi.fn(),
      getSessionMeta: vi.fn((sessionId?: string) => ({ title: sessionId || 'Child Session', directory: '/workspace' })),
      addPendingRequest: vi.fn(),
      resolvePendingRequest: vi.fn(),
      updateStatus: vi.fn(),
      getSnapshot: vi.fn(() => ({ statusMap: {} })),
      hasPendingRequest: hasPendingRequestMock,
    },
    autoApproveStoreMock: {
      fullAutoMode: 'off' as 'off' | 'session' | 'global',
      approvePendingOnFullAuto: false,
      subscribe: vi.fn((_listener: () => void) => vi.fn()),
      getPaneFullAutoMode: vi.fn((_paneId: string) => 'off' as 'off' | 'session' | 'global'),
      claimAutoReply: vi.fn((_requestId: string) => true),
      releaseAutoReply: vi.fn((_requestId: string) => undefined),
    },
  }
})

vi.mock('../api', () => ({
  subscribeToEvents: subscribeToEventsMock,
  getSessionStatus: getSessionStatusMock,
  getPendingPermissions: getPendingPermissionsMock,
  getPendingQuestions: getPendingQuestionsMock,
}))

vi.mock('../api/permission', () => ({
  replyPermission: replyPermissionMock,
}))

vi.mock('../store', () => ({
  messageStore: {
    handleMessageUpdated: vi.fn(),
    handlePartUpdated: vi.fn(),
    handlePartDelta: vi.fn(),
    handlePartRemoved: vi.fn(),
    handleSessionIdle: vi.fn(),
    handleSessionError: vi.fn(),
    getSessionState: vi.fn(() => null),
    updateSessionMetadata: vi.fn(),
  },
  childSessionStore: {
    belongsToSession: childBelongsToSessionMock,
    getSessionAndDescendants: getSessionAndDescendantsMock,
    markIdle: vi.fn(),
    markError: vi.fn(),
    registerChildSession: vi.fn(),
    getSessionInfo: getChildSessionInfoMock,
  },
  paneLayoutStore: {
    getFocusedSessionId: getFocusedSessionIdMock,
    clearSession: clearPaneSessionMock,
  },
  serverStore: {
    applyServerConnectedTimestamp: applyServerConnectedTimestampMock,
    getActiveServerId: getActiveServerIdMock,
    checkHealth: checkHealthMock,
    onServerChange: onServerChangeMock,
  },
}))

vi.mock('../store/activeSessionStore', () => ({
  activeSessionStore: activeSessionStoreMock,
}))

vi.mock('../store/childSessionStore', () => ({
  childSessionStore: {
    getSessionInfo: getChildSessionInfoMock,
  },
}))

vi.mock('../store/notificationStore', () => ({
  notificationStore: {
    push: notificationPushMock,
  },
}))

vi.mock('../store/soundStore', () => ({
  soundStore: {
    getSnapshot: () => getSoundSnapshotMock(),
  },
}))

vi.mock('../store/notificationEventSettingsStore', () => ({
  notificationEventSettingsStore: {
    isSystemEnabled: (type: 'completed' | 'permission' | 'question' | 'error') => isSystemEnabledMock(type),
    isChildSessionCompletionEnabled: () => isChildSessionCompletionEnabledMock(),
  },
}))

vi.mock('../utils/notificationSoundBridge', () => ({
  playNotificationSound: playNotificationSoundMock,
  playNotificationSoundDeduped: playNotificationSoundDedupedMock,
}))

vi.mock('../utils/sessionLifecycle', () => ({
  clearSessionRuntimeState: (...args: unknown[]) => clearSessionRuntimeStateMock(...args),
}))

vi.mock('../store/autoApproveStore', () => ({
  autoApproveStore: autoApproveStoreMock,
}))

vi.mock('./useNotification', () => ({
  sendSystemNotification: (...args: unknown[]) => sendSystemNotificationMock(...args),
}))

vi.mock('../utils/taskbarAttention', () => ({
  requestTaskbarAttention: (...args: unknown[]) => requestTaskbarAttentionMock(...args),
}))

describe('useGlobalEvents', () => {
  beforeEach(() => {
    subscribeToEventsMock.mockReset()
    getSessionStatusMock.mockClear()
    getPendingPermissionsMock.mockClear()
    getPendingQuestionsMock.mockClear()
    replyPermissionMock.mockClear()
    childBelongsToSessionMock.mockReset()
    getFocusedSessionIdMock.mockReset()
    getSessionAndDescendantsMock.mockReset()
    notificationPushMock.mockReset()
    playNotificationSoundMock.mockReset()
    playNotificationSoundDedupedMock.mockReset()
    getSoundSnapshotMock.mockReset()
    isSystemEnabledMock.mockReset()
    applyServerConnectedTimestampMock.mockReset()
    getActiveServerIdMock.mockReset()
    checkHealthMock.mockReset()
    onServerChangeMock.mockReset()
    clearSessionRuntimeStateMock.mockReset()
    clearPaneSessionMock.mockReset()
    getChildSessionInfoMock.mockReset()
    isChildSessionCompletionEnabledMock.mockReset()
    sendSystemNotificationMock.mockReset()
    hasPendingRequestMock.mockReset()
    requestTaskbarAttentionMock.mockReset()
    autoApproveStoreMock.fullAutoMode = 'off'
    autoApproveStoreMock.approvePendingOnFullAuto = false
    autoApproveStoreMock.subscribe.mockReset()
    autoApproveStoreMock.getPaneFullAutoMode.mockReset()
    autoApproveStoreMock.claimAutoReply.mockReset()
    autoApproveStoreMock.releaseAutoReply.mockReset()
    Object.values(activeSessionStoreMock).forEach(value => {
      if (typeof value === 'function' && 'mockClear' in value) value.mockClear()
    })

    subscribeToEventsMock.mockImplementation(() => vi.fn())
    getSoundSnapshotMock.mockReturnValue({
      currentSessionEnabled: true,
    })
    isSystemEnabledMock.mockImplementation((type: string) => type !== 'permission')
    getActiveServerIdMock.mockReturnValue('local')
    checkHealthMock.mockResolvedValue({ status: 'online' })
    onServerChangeMock.mockReturnValue(vi.fn())
    getSessionAndDescendantsMock.mockImplementation((sessionId: string) => [sessionId])
    autoApproveStoreMock.subscribe.mockReturnValue(vi.fn())
    autoApproveStoreMock.getPaneFullAutoMode.mockReturnValue('off')
    autoApproveStoreMock.claimAutoReply.mockReturnValue(true)
    activeSessionStoreMock.getSessionMeta.mockReturnValue({ title: 'Child Session', directory: '/workspace' })
    activeSessionStoreMock.getSnapshot.mockReturnValue({ statusMap: {} })
    getChildSessionInfoMock.mockReturnValue(undefined)
    isChildSessionCompletionEnabledMock.mockReturnValue(false)
    hasPendingRequestMock.mockReturnValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stores server clock calibration when server.connected arrives', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })

    renderHook(() => useGlobalEvents())

    await waitFor(() => expect(callbacks).toBeDefined())

    callbacks!.onServerConnected?.({ timestamp: '2026-04-22T15:00:00.000Z' })

    expect(applyServerConnectedTimestampMock).toHaveBeenCalledWith('local', '2026-04-22T15:00:00.000Z')
  })

  it('refreshes active server health on mount', async () => {
    renderHook(() => useGlobalEvents())

    await waitFor(() => expect(checkHealthMock).toHaveBeenCalledWith('local'))
  })

  it('refreshes health for the selected server when active server changes', async () => {
    let onServerChange: ((serverId: string) => void) | undefined
    onServerChangeMock.mockImplementation(listener => {
      onServerChange = listener
      return vi.fn()
    })

    renderHook(() => useGlobalEvents())

    await waitFor(() => expect(onServerChange).toBeDefined())
    checkHealthMock.mockClear()

    onServerChange!('remote')

    expect(checkHealthMock).toHaveBeenCalledWith('remote')
  })

  it('refreshes active server health when SSE reconnects', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })

    renderHook(() => useGlobalEvents())

    await waitFor(() => expect(callbacks).toBeDefined())
    checkHealthMock.mockClear()

    callbacks!.onReconnected?.('network')

    expect(checkHealthMock).toHaveBeenCalledWith('local')
  })

  it('clears runtime state and panes when a session is deleted', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })
    getSessionAndDescendantsMock.mockReturnValue(['deleted-session', 'child-session'])

    renderHook(() => useGlobalEvents())

    await waitFor(() => expect(callbacks).toBeDefined())

    callbacks!.onSessionDeleted?.('deleted-session')

    expect(clearSessionRuntimeStateMock).toHaveBeenCalledWith('deleted-session')
    expect(clearPaneSessionMock).toHaveBeenCalledWith('deleted-session')
    expect(clearPaneSessionMock).toHaveBeenCalledWith('child-session')
  })

  it('ignores stale initialization responses after directories change', async () => {
    const statusDeferreds = new Map<string, ReturnType<typeof createDeferred<Record<string, { type: string }>>>>()
    getPendingPermissionsMock.mockResolvedValue([])
    getPendingQuestionsMock.mockResolvedValue([])
    getSessionStatusMock.mockImplementation(directory => {
      const key = directory || 'root'
      const deferred = createDeferred<Record<string, { type: string }>>()
      statusDeferreds.set(key, deferred)
      return deferred.promise
    })

    const { rerender } = renderHook(({ directories }) => useGlobalEvents(directories), {
      initialProps: { directories: ['/one'] as string[] | undefined },
    })

    await waitFor(() => expect(getSessionStatusMock).toHaveBeenCalledWith('/one'))

    rerender({ directories: ['/two'] })

    await waitFor(() => expect(getSessionStatusMock).toHaveBeenCalledWith('/two'))

    statusDeferreds.get('/two')?.resolve({ 'new-session': { type: 'busy' } })

    await waitFor(() => {
      expect(activeSessionStoreMock.mergeStatusRefresh).toHaveBeenCalledTimes(1)
      expect(activeSessionStoreMock.mergeStatusRefresh).toHaveBeenCalledWith({ 'new-session': { type: 'busy' } })
    })

    statusDeferreds.get('/one')?.resolve({ 'old-session': { type: 'idle' } })
    await Promise.resolve()
    await Promise.resolve()

    expect(activeSessionStoreMock.mergeStatusRefresh).toHaveBeenCalledTimes(1)
    expect(activeSessionStoreMock.mergeStatusRefresh).not.toHaveBeenCalledWith({ 'old-session': { type: 'idle' } })
  })

  it('replays pending requests that arrive while initialization is in flight', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    const statusDeferred = createDeferred<Record<string, { type: string }>>()

    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })
    getSessionStatusMock.mockImplementation(() => statusDeferred.promise)
    getPendingPermissionsMock.mockResolvedValue([])
    getPendingQuestionsMock.mockResolvedValue([])

    renderHook(() => useGlobalEvents(['/workspace']))

    await waitFor(() => expect(getSessionStatusMock).toHaveBeenCalledWith('/workspace'))
    await waitFor(() => expect(callbacks).toBeDefined())

    callbacks!.onPermissionAsked?.({
      id: 'perm-1',
      sessionID: 'child-session',
      permission: 'edit',
      patterns: ['src/app.tsx'],
    } as never)

    statusDeferred.resolve({})

    await waitFor(() => expect(activeSessionStoreMock.initializePendingRequests).toHaveBeenCalled())

    expect(activeSessionStoreMock.addPendingRequest).toHaveBeenNthCalledWith(
      1,
      'perm-1',
      'child-session',
      'permission',
      'edit: src/app.tsx',
    )
    expect(activeSessionStoreMock.addPendingRequest).toHaveBeenNthCalledWith(
      2,
      'perm-1',
      'child-session',
      'permission',
      'edit: src/app.tsx',
    )
  })

  it('does not replay or notify a late permission resolved locally before initialization completes', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    const statusDeferred = createDeferred<Record<string, { type: string }>>()
    const fetchComplete = createDeferred<void>()
    const pendingRequestIds = new Set<string>()

    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })
    getSessionStatusMock.mockImplementation(() => statusDeferred.promise)
    getPendingPermissionsMock.mockResolvedValue([])
    getPendingQuestionsMock.mockResolvedValue([])
    isSystemEnabledMock.mockReturnValue(true)
    activeSessionStoreMock.addPendingRequest.mockImplementation((requestId: string) => {
      pendingRequestIds.add(requestId)
    })
    activeSessionStoreMock.resolvePendingRequest.mockImplementation((requestId: string) => {
      pendingRequestIds.delete(requestId)
    })
    hasPendingRequestMock.mockImplementation(requestId => pendingRequestIds.has(requestId))
    activeSessionStoreMock.setSessionMetaBulk.mockImplementation(() => fetchComplete.resolve())

    try {
      renderHook(() => useGlobalEvents(['/workspace']))

      await waitFor(() => expect(getSessionStatusMock).toHaveBeenCalledWith('/workspace'))
      await waitFor(() => expect(callbacks).toBeDefined())
      vi.useFakeTimers()

      callbacks!.onPermissionAsked?.({
        id: 'permission-local-reply',
        sessionID: 'background-session',
        permission: 'bash',
        patterns: [],
      } as never)
      activeSessionStoreMock.resolvePendingRequest('permission-local-reply')
      statusDeferred.resolve({})

      await fetchComplete.promise
      act(() => {
        vi.advanceTimersByTime(500)
      })

      expect(activeSessionStoreMock.addPendingRequest).toHaveBeenCalledTimes(1)
      expect(sendSystemNotificationMock).not.toHaveBeenCalled()
      expect(notificationPushMock).not.toHaveBeenCalled()
    } finally {
      activeSessionStoreMock.addPendingRequest.mockReset()
      activeSessionStoreMock.resolvePendingRequest.mockReset()
      activeSessionStoreMock.setSessionMetaBulk.mockReset()
    }
  })

  it('does not replay late pending requests after an active server change', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    let onServerChange: ((serverId: string) => void) | undefined
    const statusDeferred = createDeferred<Record<string, { type: string }>>()

    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })
    onServerChangeMock.mockImplementation(listener => {
      onServerChange = listener
      return vi.fn()
    })
    getSessionStatusMock.mockImplementation(() => statusDeferred.promise)
    getPendingPermissionsMock.mockResolvedValue([])
    getPendingQuestionsMock.mockResolvedValue([])

    renderHook(() => useGlobalEvents(['/workspace']))

    await waitFor(() => expect(getSessionStatusMock).toHaveBeenCalledWith('/workspace'))
    await waitFor(() => expect(callbacks).toBeDefined())

    callbacks!.onPermissionAsked?.({
      id: 'permission-server-change',
      sessionID: 'background-session',
      permission: 'bash',
      patterns: [],
    } as never)
    onServerChange?.('remote')
    statusDeferred.resolve({})

    await waitFor(() => expect(activeSessionStoreMock.initializePendingRequests).toHaveBeenCalled())

    expect(activeSessionStoreMock.addPendingRequest).toHaveBeenCalledTimes(1)
  })

  it('does not replay late pending descendant requests after session deletion', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    const statusDeferred = createDeferred<Record<string, { type: string }>>()

    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })
    getSessionAndDescendantsMock.mockReturnValue(['parent-session', 'child-session'])
    getSessionStatusMock.mockImplementation(() => statusDeferred.promise)
    getPendingPermissionsMock.mockResolvedValue([])
    getPendingQuestionsMock.mockResolvedValue([])

    renderHook(() => useGlobalEvents(['/workspace']))

    await waitFor(() => expect(getSessionStatusMock).toHaveBeenCalledWith('/workspace'))
    await waitFor(() => expect(callbacks).toBeDefined())

    callbacks!.onPermissionAsked?.({
      id: 'permission-deleted-child',
      sessionID: 'child-session',
      permission: 'bash',
      patterns: [],
    } as never)
    callbacks!.onSessionDeleted?.('parent-session')
    statusDeferred.resolve({})

    await waitFor(() => expect(activeSessionStoreMock.initializePendingRequests).toHaveBeenCalled())

    expect(activeSessionStoreMock.addPendingRequest).toHaveBeenCalledTimes(1)
  })

  it('keeps replaying pending requests across overlapping initialization fetches', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    const statusDeferreds = new Map<string, ReturnType<typeof createDeferred<Record<string, { type: string }>>>>()

    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })
    activeSessionStoreMock.getSessionMeta.mockImplementation((sessionId?: string) => {
      if (sessionId === 'child-session') return { title: 'Child Session', directory: '/one' }
      if (sessionId === 'question-session') return { title: 'Question Session', directory: '/two' }
      return { title: 'Session', directory: '/workspace' }
    })
    getSessionStatusMock.mockImplementation(directory => {
      const key = directory || 'root'
      const deferred = createDeferred<Record<string, { type: string }>>()
      statusDeferreds.set(key, deferred)
      return deferred.promise
    })
    getPendingPermissionsMock.mockResolvedValue([])
    getPendingQuestionsMock.mockResolvedValue([])

    const { rerender } = renderHook(({ directories }) => useGlobalEvents(directories), {
      initialProps: { directories: ['/one'] as string[] | undefined },
    })

    await waitFor(() => expect(getSessionStatusMock).toHaveBeenCalledWith('/one'))
    await waitFor(() => expect(callbacks).toBeDefined())

    callbacks!.onPermissionAsked?.({
      id: 'perm-1',
      sessionID: 'child-session',
      permission: 'edit',
      patterns: ['src/app.tsx'],
    } as never)

    rerender({ directories: ['/two'] })

    await waitFor(() => expect(getSessionStatusMock).toHaveBeenCalledWith('/two'))

    callbacks!.onQuestionAsked?.({
      id: 'question-1',
      sessionID: 'question-session',
      questions: [{ header: 'Need input' }],
    } as never)

    statusDeferreds.get('/two')?.resolve({})

    await waitFor(() => expect(activeSessionStoreMock.mergePendingRequests).toHaveBeenCalledTimes(1))

    expect(activeSessionStoreMock.addPendingRequest.mock.calls.filter(call => call[0] === 'perm-1')).toHaveLength(1)
    expect(activeSessionStoreMock.addPendingRequest.mock.calls.filter(call => call[0] === 'question-1')).toHaveLength(2)
  })

  it('does not play current-session sound for child session events when parent session is focused', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })
    getFocusedSessionIdMock.mockReturnValue('parent-session')
    childBelongsToSessionMock.mockImplementation((sessionId: string, rootSessionId: string) => {
      return sessionId === 'child-session' && rootSessionId === 'parent-session'
    })

    renderHook(() => useGlobalEvents())

    await waitFor(() => expect(callbacks).toBeDefined())

    callbacks!.onPermissionAsked?.({
      id: 'perm-1',
      sessionID: 'child-session',
      permission: 'bash',
      patterns: [],
    })

    expect(notificationPushMock).not.toHaveBeenCalled()
    expect(playNotificationSoundDedupedMock).not.toHaveBeenCalled()
  })

  it('keeps later pending question requests for the same session after one reply arrives', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    const consumerAskedMock = vi.fn()
    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })

    renderHook(() => useGlobalEvents())

    await waitFor(() => expect(callbacks).toBeDefined())

    callbacks!.onQuestionAsked?.({
      id: 'question-1',
      sessionID: 'child-session',
      questions: [{ header: 'First question' }],
    })
    callbacks!.onQuestionAsked?.({
      id: 'question-2',
      sessionID: 'child-session',
      questions: [{ header: 'Second question' }],
    })

    expect(consumerAskedMock).not.toHaveBeenCalled()

    callbacks!.onQuestionReplied?.({
      sessionID: 'child-session',
      requestID: 'question-1',
    })

    getFocusedSessionIdMock.mockReturnValue('parent-session')
    childBelongsToSessionMock.mockImplementation((sessionId: string, rootSessionId: string) => {
      return sessionId === 'child-session' && rootSessionId === 'parent-session'
    })

    const unregister = registerSessionConsumer('pane-1', 'parent-session', {
      onQuestionAsked: consumerAskedMock,
    })

    callbacks!.onSessionCreated?.({
      id: 'child-session',
      parentID: 'parent-session',
      title: 'Child Session',
      directory: '/workspace',
    } as never)

    expect(consumerAskedMock).toHaveBeenCalledTimes(1)
    expect(consumerAskedMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'question-2', sessionID: 'child-session' }),
    )

    unregister()
  })

  it('approves already waiting permissions when global full auto pending sweep is enabled', async () => {
    const consumerRepliedMock = vi.fn()
    const unregister = registerSessionConsumer('pane-global', 'background-session', {
      onPermissionReplied: consumerRepliedMock,
    })
    autoApproveStoreMock.fullAutoMode = 'global'
    autoApproveStoreMock.approvePendingOnFullAuto = true
    getPendingPermissionsMock.mockResolvedValue([
      {
        id: 'perm-global',
        sessionID: 'background-session',
        permission: 'bash',
        patterns: ['npm test'],
      },
    ])
    activeSessionStoreMock.getSessionMeta.mockReturnValue({ title: 'Background', directory: '/workspace' })

    renderHook(() => useGlobalEvents(['/workspace']))

    await waitFor(() => {
      expect(replyPermissionMock).toHaveBeenCalledWith(
        'perm-global',
        'once',
        undefined,
        '/workspace',
        'background-session',
      )
    })
    expect(autoApproveStoreMock.claimAutoReply).toHaveBeenCalledWith('perm-global')
    await waitFor(() => {
      expect(consumerRepliedMock).toHaveBeenCalledWith({ sessionID: 'background-session', requestID: 'perm-global' })
    })
    expect(activeSessionStoreMock.resolvePendingRequest).toHaveBeenCalledWith('perm-global')

    unregister()
  })

  it('broadcasts permission replied events to consumers even when the current session does not match', async () => {
    const consumerRepliedMock = vi.fn()
    const unregister = registerSessionConsumer('pane-mismatch', 'other-session', {
      onPermissionReplied: consumerRepliedMock,
    })
    autoApproveStoreMock.fullAutoMode = 'global'
    autoApproveStoreMock.approvePendingOnFullAuto = true
    getPendingPermissionsMock.mockResolvedValue([
      {
        id: 'perm-mismatch',
        sessionID: 'background-session',
        permission: 'bash',
        patterns: ['npm test'],
      },
    ])
    activeSessionStoreMock.getSessionMeta.mockReturnValue({ title: 'Background', directory: '/workspace' })

    renderHook(() => useGlobalEvents(['/workspace']))

    await waitFor(() => {
      expect(replyPermissionMock).toHaveBeenCalledWith(
        'perm-mismatch',
        'once',
        undefined,
        '/workspace',
        'background-session',
      )
    })
    await waitFor(() => {
      expect(consumerRepliedMock).toHaveBeenCalledWith({ sessionID: 'background-session', requestID: 'perm-mismatch' })
    })

    unregister()
  })

  it('does not approve already waiting permissions when the pending sweep is disabled', async () => {
    autoApproveStoreMock.fullAutoMode = 'global'
    autoApproveStoreMock.approvePendingOnFullAuto = false
    getPendingPermissionsMock.mockResolvedValue([
      {
        id: 'perm-global',
        sessionID: 'background-session',
        permission: 'bash',
        patterns: ['npm test'],
      },
    ])

    renderHook(() => useGlobalEvents(['/workspace']))

    await waitFor(() => expect(getPendingPermissionsMock).toHaveBeenCalled())
    expect(replyPermissionMock).not.toHaveBeenCalled()
  })

  it('still plays current-session sound for the directly focused session', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })
    getFocusedSessionIdMock.mockReturnValue('child-session')

    renderHook(() => useGlobalEvents())

    await waitFor(() => expect(callbacks).toBeDefined())
    vi.useFakeTimers()

    callbacks!.onPermissionAsked?.({
      id: 'perm-2',
      sessionID: 'child-session',
      permission: 'bash',
      patterns: [],
    })
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(notificationPushMock).not.toHaveBeenCalled()
    expect(playNotificationSoundMock).toHaveBeenCalledWith('permission')
  })

  it('still plays current-session sound when the matching system notification toggle is disabled', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })
    getFocusedSessionIdMock.mockReturnValue('child-session')
    isSystemEnabledMock.mockImplementation(type => type !== 'permission')

    renderHook(() => useGlobalEvents())

    await waitFor(() => expect(callbacks).toBeDefined())
    vi.useFakeTimers()

    callbacks!.onPermissionAsked?.({
      id: 'perm-sound',
      sessionID: 'child-session',
      permission: 'bash',
      patterns: [],
    })
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(notificationPushMock).not.toHaveBeenCalled()
    expect(playNotificationSoundMock).toHaveBeenCalledWith('permission')
  })

  it('does not play permission sound for a session full-auto pane', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })
    getFocusedSessionIdMock.mockReturnValue('child-session')
    isSystemEnabledMock.mockReturnValue(true)
    autoApproveStoreMock.getPaneFullAutoMode.mockImplementation(paneId => (paneId === 'test-pane' ? 'session' : 'off'))
    const unregister = registerSessionConsumer('test-pane', 'child-session', {})

    renderHook(() => useGlobalEvents())

    await waitFor(() => expect(callbacks).toBeDefined())
    vi.useFakeTimers()

    callbacks!.onPermissionAsked?.({
      id: 'perm-session-auto',
      sessionID: 'child-session',
      permission: 'bash',
      patterns: [],
    })
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(notificationPushMock).not.toHaveBeenCalled()
    expect(playNotificationSoundMock).not.toHaveBeenCalled()
    expect(sendSystemNotificationMock).not.toHaveBeenCalled()

    unregister()
  })

  it('drops a queued permission notification when session full auto is enabled before flush', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })
    isSystemEnabledMock.mockReturnValue(true)
    autoApproveStoreMock.getPaneFullAutoMode.mockReturnValue('off')
    const unregister = registerSessionConsumer('test-pane', 'child-session', {})

    try {
      renderHook(() => useGlobalEvents())

      await waitFor(() => expect(callbacks).toBeDefined())
      vi.useFakeTimers()
      callbacks!.onPermissionAsked?.({
        id: 'perm-session-auto-late',
        sessionID: 'child-session',
        permission: 'bash',
        patterns: [],
      })
      autoApproveStoreMock.getPaneFullAutoMode.mockReturnValue('session')
      act(() => {
        vi.advanceTimersByTime(500)
      })

      expect(sendSystemNotificationMock).not.toHaveBeenCalled()
      expect(notificationPushMock).not.toHaveBeenCalled()
      expect(requestTaskbarAttentionMock).not.toHaveBeenCalled()
    } finally {
      unregister()
    }
  })

  it('does not play permission sound for a child session of a session full-auto pane', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })
    childBelongsToSessionMock.mockImplementation((sessionId, rootSessionId) => {
      return sessionId === 'child-session' && rootSessionId === 'parent-session'
    })
    getFocusedSessionIdMock.mockReturnValue('child-session')
    isSystemEnabledMock.mockReturnValue(true)
    autoApproveStoreMock.getPaneFullAutoMode.mockImplementation(paneId => (paneId === 'test-pane' ? 'session' : 'off'))
    const unregister = registerSessionConsumer('test-pane', 'parent-session', {})

    renderHook(() => useGlobalEvents())

    await waitFor(() => expect(callbacks).toBeDefined())
    vi.useFakeTimers()

    callbacks!.onPermissionAsked?.({
      id: 'perm-child-session-auto',
      sessionID: 'child-session',
      permission: 'bash',
      patterns: [],
    })
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(notificationPushMock).not.toHaveBeenCalled()
    expect(playNotificationSoundMock).not.toHaveBeenCalled()
    expect(sendSystemNotificationMock).not.toHaveBeenCalled()

    unregister()
  })

  it('still plays permission sound for another pane without session full auto', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })
    getFocusedSessionIdMock.mockReturnValue('other-session')
    autoApproveStoreMock.getPaneFullAutoMode.mockImplementation(paneId => (paneId === 'auto-pane' ? 'session' : 'off'))
    const unregisterAutoPane = registerSessionConsumer('auto-pane', 'auto-session', {})
    const unregisterOtherPane = registerSessionConsumer('other-pane', 'other-session', {})

    renderHook(() => useGlobalEvents())

      await waitFor(() => expect(callbacks).toBeDefined())
      vi.useFakeTimers()

      callbacks!.onPermissionAsked?.({
        id: 'perm-other-pane',
        sessionID: 'other-session',
        permission: 'bash',
        patterns: [],
      })
      act(() => {
        vi.advanceTimersByTime(500)
      })

    expect(notificationPushMock).not.toHaveBeenCalled()
    expect(playNotificationSoundMock).toHaveBeenCalledWith('permission')

    unregisterAutoPane()
    unregisterOtherPane()
  })

  it('suppresses known child completion toast and sound while child completion reminders are disabled', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })
    activeSessionStoreMock.getSnapshot.mockReturnValue({ statusMap: { 'child-session': { type: 'busy' } } })
    getChildSessionInfoMock.mockReturnValue({ id: 'child-session' })
    isChildSessionCompletionEnabledMock.mockReturnValue(false)

    renderHook(() => useGlobalEvents())

    await waitFor(() => expect(callbacks).toBeDefined())

    callbacks!.onSessionStatus?.({ sessionID: 'child-session', status: { type: 'idle' } } as never)

    expect(notificationPushMock).not.toHaveBeenCalled()
    expect(playNotificationSoundDedupedMock).not.toHaveBeenCalled()
    expect(requestTaskbarAttentionMock).not.toHaveBeenCalled()
  })

  it('keeps unknown completion reminders fail-open while child completion reminders are disabled', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })
    activeSessionStoreMock.getSnapshot.mockReturnValue({ statusMap: { 'unknown-session': { type: 'busy' } } })
    getChildSessionInfoMock.mockReturnValue(undefined)
    isChildSessionCompletionEnabledMock.mockReturnValue(false)

    renderHook(() => useGlobalEvents())

    await waitFor(() => expect(callbacks).toBeDefined())

    callbacks!.onSessionStatus?.({ sessionID: 'unknown-session', status: { type: 'idle' } } as never)

    expect(notificationPushMock).toHaveBeenCalledTimes(1)
    expect(requestTaskbarAttentionMock).toHaveBeenCalledTimes(1)
  })

  it('requests taskbar attention when session.idle arrives without a status transition', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })

    renderHook(() => useGlobalEvents())

    await waitFor(() => expect(callbacks).toBeDefined())
    callbacks!.onSessionIdle?.({ sessionID: 'main-session' })

    expect(requestTaskbarAttentionMock).toHaveBeenCalledWith('completed:main-session')
  })

  it('continues to dispatch known child permission and question requests', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    const permissionAsked = vi.fn()
    const questionAsked = vi.fn()
    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })
    childBelongsToSessionMock.mockImplementation(
      (sessionId, rootSessionId) => sessionId === 'child-session' && rootSessionId === 'parent-session',
    )
    getChildSessionInfoMock.mockReturnValue({ id: 'child-session' })
    const unregister = registerSessionConsumer('child-pane', 'parent-session', {
      onPermissionAsked: permissionAsked,
      onQuestionAsked: questionAsked,
    })

    try {
      renderHook(() => useGlobalEvents())

      await waitFor(() => expect(callbacks).toBeDefined())

      callbacks!.onPermissionAsked?.({
        id: 'permission-child',
        sessionID: 'child-session',
        permission: 'bash',
        patterns: [],
      } as never)
      callbacks!.onQuestionAsked?.({
        id: 'question-child',
        sessionID: 'child-session',
        questions: [{ header: 'Need input' }],
      } as never)

      expect(permissionAsked).toHaveBeenCalledTimes(1)
      expect(questionAsked).toHaveBeenCalledTimes(1)
      expect(requestTaskbarAttentionMock).toHaveBeenCalledTimes(1)
    } finally {
      unregister()
    }
  })

  it('merges consecutive permission notifications for one session', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })
    isSystemEnabledMock.mockReturnValue(true)

    renderHook(() => useGlobalEvents())

    await waitFor(() => expect(callbacks).toBeDefined())
    vi.useFakeTimers()

    callbacks!.onPermissionAsked?.({
      id: 'permission-1',
      sessionID: 'background-session',
      permission: 'bash',
      patterns: ['first'],
    } as never)
    act(() => {
      vi.advanceTimersByTime(300)
    })
    callbacks!.onPermissionAsked?.({
      id: 'permission-2',
      sessionID: 'background-session',
      permission: 'bash',
      patterns: ['second'],
    } as never)

    expect(notificationPushMock).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(sendSystemNotificationMock).toHaveBeenCalledTimes(1)
    expect(notificationPushMock).toHaveBeenCalledTimes(1)
    expect(requestTaskbarAttentionMock).toHaveBeenCalledTimes(1)
  })

  it('flushes permission notification groups from different sessions independently', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })
    isSystemEnabledMock.mockReturnValue(true)

    renderHook(() => useGlobalEvents())

    await waitFor(() => expect(callbacks).toBeDefined())
    vi.useFakeTimers()

    callbacks!.onPermissionAsked?.({
      id: 'permission-a',
      sessionID: 'background-a',
      permission: 'bash',
      patterns: [],
    } as never)
    callbacks!.onPermissionAsked?.({
      id: 'permission-b',
      sessionID: 'background-b',
      permission: 'bash',
      patterns: [],
    } as never)
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(sendSystemNotificationMock).toHaveBeenCalledTimes(2)
    expect(notificationPushMock).toHaveBeenCalledTimes(2)
  })

  it('plays one permission sound for each directly open session batch', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })
    isSystemEnabledMock.mockReturnValue(true)
    const unregisterFirst = registerSessionConsumer('first-pane', 'direct-session-a', {})
    const unregisterSecond = registerSessionConsumer('second-pane', 'direct-session-b', {})

    try {
      renderHook(() => useGlobalEvents())

      await waitFor(() => expect(callbacks).toBeDefined())
      vi.useFakeTimers()

      callbacks!.onPermissionAsked?.({
        id: 'permission-a',
        sessionID: 'direct-session-a',
        permission: 'bash',
        patterns: [],
      } as never)
      callbacks!.onPermissionAsked?.({
        id: 'permission-b',
        sessionID: 'direct-session-b',
        permission: 'bash',
        patterns: [],
      } as never)
      act(() => {
        vi.advanceTimersByTime(500)
      })

      expect(playNotificationSoundMock).toHaveBeenCalledTimes(2)
      expect(playNotificationSoundMock).toHaveBeenCalledWith('permission')
      expect(playNotificationSoundDedupedMock).not.toHaveBeenCalled()
    } finally {
      unregisterFirst()
      unregisterSecond()
    }
  })

  it('drops queued permission notifications when every request is replied before flush', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })
    isSystemEnabledMock.mockReturnValue(true)

    renderHook(() => useGlobalEvents())

    await waitFor(() => expect(callbacks).toBeDefined())
    vi.useFakeTimers()

    callbacks!.onPermissionAsked?.({
      id: 'permission-resolved',
      sessionID: 'background-session',
      permission: 'bash',
      patterns: [],
    } as never)
    callbacks!.onPermissionReplied?.({ sessionID: 'background-session', requestID: 'permission-resolved' })
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(sendSystemNotificationMock).not.toHaveBeenCalled()
    expect(notificationPushMock).not.toHaveBeenCalled()
  })

  it('drops queued permission notifications that are no longer active at flush', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })
    isSystemEnabledMock.mockReturnValue(true)

    renderHook(() => useGlobalEvents())

    await waitFor(() => expect(callbacks).toBeDefined())
    vi.useFakeTimers()

    callbacks!.onPermissionAsked?.({
      id: 'permission-stale',
      sessionID: 'background-session',
      permission: 'bash',
      patterns: [],
    } as never)
    hasPendingRequestMock.mockReturnValue(false)
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(sendSystemNotificationMock).not.toHaveBeenCalled()
    expect(notificationPushMock).not.toHaveBeenCalled()
  })

  it('cancels queued permission notifications when a session is deleted', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })
    isSystemEnabledMock.mockReturnValue(true)

    renderHook(() => useGlobalEvents())

    await waitFor(() => expect(callbacks).toBeDefined())
    vi.useFakeTimers()

    callbacks!.onPermissionAsked?.({
      id: 'permission-deleted',
      sessionID: 'background-session',
      permission: 'bash',
      patterns: [],
    } as never)
    callbacks!.onSessionDeleted?.('background-session')
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(sendSystemNotificationMock).not.toHaveBeenCalled()
    expect(notificationPushMock).not.toHaveBeenCalled()
  })

  it('clears queued permission notifications when the active server changes', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    let onServerChange: ((serverId: string) => void) | undefined
    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })
    onServerChangeMock.mockImplementation(listener => {
      onServerChange = listener
      return vi.fn()
    })
    isSystemEnabledMock.mockReturnValue(true)

    renderHook(() => useGlobalEvents())

    await waitFor(() => expect(callbacks).toBeDefined())
    vi.useFakeTimers()

    callbacks!.onPermissionAsked?.({
      id: 'permission-server-change',
      sessionID: 'background-session',
      permission: 'bash',
      patterns: [],
    } as never)
    onServerChange?.('remote')
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(sendSystemNotificationMock).not.toHaveBeenCalled()
    expect(notificationPushMock).not.toHaveBeenCalled()
  })

  it('disposes queued permission notifications when the global event effect unmounts', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })
    isSystemEnabledMock.mockReturnValue(true)

    const { unmount } = renderHook(() => useGlobalEvents())

    await waitFor(() => expect(callbacks).toBeDefined())
    vi.useFakeTimers()

    callbacks!.onPermissionAsked?.({
      id: 'permission-unmount',
      sessionID: 'background-session',
      permission: 'bash',
      patterns: [],
    } as never)
    unmount()
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(sendSystemNotificationMock).not.toHaveBeenCalled()
    expect(notificationPushMock).not.toHaveBeenCalled()
  })

  it('dispatches permission UI to every matching pane while sending one system notification', async () => {
    let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
    const firstPane = vi.fn()
    const secondPane = vi.fn()
    subscribeToEventsMock.mockImplementation(cb => {
      callbacks = cb
      return vi.fn()
    })
    isSystemEnabledMock.mockReturnValue(true)
    const unregisterFirst = registerSessionConsumer('first-pane', 'shared-session', { onPermissionAsked: firstPane })
    const unregisterSecond = registerSessionConsumer('second-pane', 'shared-session', { onPermissionAsked: secondPane })

    try {
      renderHook(() => useGlobalEvents())

      await waitFor(() => expect(callbacks).toBeDefined())
      vi.useFakeTimers()

      callbacks!.onPermissionAsked?.({
        id: 'permission-shared',
        sessionID: 'shared-session',
        permission: 'bash',
        patterns: [],
      } as never)

      expect(firstPane).toHaveBeenCalledTimes(1)
      expect(secondPane).toHaveBeenCalledTimes(1)

      act(() => {
        vi.advanceTimersByTime(500)
      })

      expect(sendSystemNotificationMock).toHaveBeenCalledTimes(1)
      expect(playNotificationSoundMock).toHaveBeenCalledTimes(1)
    } finally {
      unregisterFirst()
      unregisterSecond()
    }
  })

  it.each([
    {
      disabledType: 'permission',
      trigger: 'onPermissionAsked',
      payload: { id: 'perm-3', sessionID: 'background-session', permission: 'bash', patterns: [] },
    },
    {
      disabledType: 'question',
      trigger: 'onQuestionAsked',
      payload: {
        id: 'question-3',
        sessionID: 'background-session',
        questions: [{ header: 'Need input' }],
      },
    },
    {
      disabledType: 'completed',
      trigger: 'onSessionStatus',
      beforeTrigger: () => {
        activeSessionStoreMock.getSnapshot.mockReturnValue({ statusMap: { 'background-session': { type: 'busy' } } })
      },
      payload: { sessionID: 'background-session', status: { type: 'idle' } },
    },
    {
      disabledType: 'error',
      trigger: 'onSessionError',
      payload: { sessionID: 'background-session', name: 'Error' },
    },
  ])(
    'keeps background notifications working when the $disabledType system notification toggle is disabled',
    async ({ disabledType, trigger, payload, beforeTrigger }) => {
      let callbacks: Parameters<typeof subscribeToEventsMock>[0] | undefined
      subscribeToEventsMock.mockImplementation(cb => {
        callbacks = cb
        return vi.fn()
      })
      isSystemEnabledMock.mockImplementation(type => type !== disabledType)
      beforeTrigger?.()

      renderHook(() => useGlobalEvents())

      await waitFor(() => expect(callbacks).toBeDefined())

      if (trigger === 'onPermissionAsked') vi.useFakeTimers()
      callbacks![trigger as keyof typeof callbacks]?.(payload as never)
      if (trigger === 'onPermissionAsked') {
        act(() => {
          vi.advanceTimersByTime(500)
        })
      }

      expect(notificationPushMock).toHaveBeenCalledTimes(1)
      expect(playNotificationSoundDedupedMock).not.toHaveBeenCalled()
    },
  )
})
