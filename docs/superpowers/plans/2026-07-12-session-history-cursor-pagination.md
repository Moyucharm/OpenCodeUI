# 会话历史游标分页实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 `superpowers:executing-plans` 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 用 OpenCode 的 `before` 游标分页替代累计 `limit` 拉取，避免长会话历史重复下载，并让加载超时、失败和滚动锚点可恢复。

**架构：** `src/api/message.ts` 将 SDK 响应及 `X-Next-Cursor` 封装为页对象。`useSessionManager` 按 session 保存页 cursor，并在不支持游标的服务端保留现有累计 `limit` 退路。消息 store 持有分页元数据与历史加载错误，聊天区域据此展示可重试状态并以“新增消息”而非“页数增加”恢复锚点。

**技术栈：** React 19、TypeScript、Vitest、`@opencode-ai/sdk` 1.17.14、OpenCode HTTP API。

---

## 文件结构

- `package.json` / `package-lock.json`：将 SDK 升级至支持 `before` 参数和 response headers 的版本。
- `src/api/message.ts`：定义会话消息页、转发 `before`，读取 `X-Next-Cursor`。
- `src/api/message.test.ts`：覆盖页查询参数、cursor header 与旧调用兼容性。
- `src/store/messageStoreTypes.ts`：会话级历史 cursor、分页模式与历史错误状态。
- `src/store/messageStore.ts`：初始化、更新并暴露历史分页元数据；支持合并刷新快照。
- `src/store/messageStoreHooks.ts`：向 session subscriber 暴露历史加载/错误状态。
- `src/hooks/useSessionManager.ts`：游标分页、旧服务端退路、请求超时、世代保护及 force refresh 合并。
- `src/hooks/useSessionManager.test.tsx`：覆盖 cursor、回退、超时、并发陈旧响应与 force refresh。
- `src/hooks/useChatSession.ts`：将 session 分页状态传给聊天 pane。
- `src/features/chat/ChatPane.tsx`：将历史加载状态和错误传给聊天区域。
- `src/features/chat/ChatArea.tsx`：显示历史加载错误，并在 prepend 后恢复锚点。
- `src/features/chat/ChatArea.test.ts`：覆盖不新增页的 prepend 锚点和测量高度失效。

### 任务 1：升级 SDK 并封装游标页 API

**文件：**
- 修改：`package.json`
- 修改：`package-lock.json`
- 修改：`src/api/message.ts`
- 创建：`src/api/message.test.ts`

- [x] **步骤 1：编写失败的 API 页查询测试**

```ts
it('passes before and returns the next cursor from the SDK response', async () => {
  sessionMessagesMock.mockResolvedValue({
    data: [message],
    response: new Response('[]', { headers: { 'X-Next-Cursor': 'older-page' } }),
  })

  await expect(getSessionMessagePage('session-1', { limit: 50, before: 'current-page' })).resolves.toEqual({
    messages: [message],
    nextCursor: 'older-page',
  })
  expect(sessionMessagesMock).toHaveBeenCalledWith(
    expect.objectContaining({ sessionID: 'session-1', limit: 50, before: 'current-page' }),
  )
})
```

- [x] **步骤 2：运行测试确认缺少导出而失败**

运行：`npx vitest run src/api/message.test.ts`

预期：FAIL，`getSessionMessagePage` 不是导出成员。

- [x] **步骤 3：升级 SDK 并实现最小页 API**

```ts
export type SessionMessagePage = {
  messages: ApiMessageWithParts[]
  nextCursor?: string
}

export async function getSessionMessagePage(
  sessionId: string,
  options: { limit: number; directory?: string; before?: string },
): Promise<SessionMessagePage> {
  const result = await getSDKClient().session.messages({
    sessionID: sessionId,
    directory: formatPathForApi(options.directory),
    limit: options.limit,
    before: options.before,
  })
  return {
    messages: unwrap<ApiMessageWithParts[]>(result),
    nextCursor: result.response.headers.get('X-Next-Cursor') ?? undefined,
  }
}
```

- [x] **步骤 4：运行 API 测试确认通过**

运行：`npx vitest run src/api/message.test.ts`

预期：PASS。

### 任务 2：将历史分页状态纳入 session store

**文件：**
- 修改：`src/store/messageStoreTypes.ts`
- 修改：`src/store/messageStore.ts`
- 修改：`src/store/messageStoreHooks.ts`
- 修改：`src/store/messageStore.test.ts`

- [x] **步骤 1：编写失败的 store 行为测试**

```ts
it('retains an established cursor after a latest-page refresh', () => {
  messageStore.setMessages('session-1', olderAndLatest, {
    historyCursor: 'older-page',
    paginationMode: 'cursor',
  })
  messageStore.mergeMessages('session-1', latestOnly, { preserveHistory: true })

  expect(messageStore.getSessionState('session-1')).toMatchObject({
    historyCursor: 'older-page',
    paginationMode: 'cursor',
  })
})
```

- [x] **步骤 2：运行 store 测试确认缺少状态/方法而失败**

运行：`npx vitest run src/store/messageStore.test.ts`

预期：FAIL，历史分页字段或 `mergeMessages` 尚不存在。

- [x] **步骤 3：实现最小共享分页状态**

```ts
historyCursor?: string
paginationMode: 'unknown' | 'cursor' | 'legacy'
isLoadingHistory: boolean
historyLoadError?: MessageError
historyGeneration: number
```

`mergeMessages()` 以 API 快照覆盖同 ID 消息、保留已加载的更早消息并按创建时间排序；force refresh 不得缩短历史。

- [x] **步骤 4：运行 store 测试确认通过**

运行：`npx vitest run src/store/messageStore.test.ts src/store/messageStoreHooks.test.tsx`

预期：PASS。

### 任务 3：实现有界、去重且可回退的加载流程

**文件：**
- 修改：`src/hooks/useSessionManager.ts`
- 修改：`src/hooks/useSessionManager.test.tsx`

- [x] **步骤 1：编写失败的 hook 测试**

```ts
it('requests older history with the stored cursor instead of a larger limit', async () => {
  getSessionMessagePageMock
    .mockResolvedValueOnce({ messages: newest, nextCursor: 'cursor-1' })
    .mockResolvedValueOnce({ messages: older, nextCursor: undefined })

  const { result } = renderHook(() => useSessionManager({ sessionId: 'session-1' }))
  await waitFor(() => expect(getSessionMessagePageMock).toHaveBeenLastCalledWith(
    'session-1',
    expect.objectContaining({ limit: 50, before: 'cursor-1' }),
  ))
})
```

- [x] **步骤 2：运行 hook 测试确认当前累计 limit 行为失败**

运行：`npx vitest run src/hooks/useSessionManager.test.tsx`

预期：FAIL，现有实现以 `targetCursor = currentCursor + 50` 调用旧 API。

- [x] **步骤 3：实现游标、退路和超时**

```ts
const HISTORY_PAGE_SIZE = 50

// cursor mode: each request retrieves exactly one older page.
// legacy mode: preserve the current cumulative-limit behavior only when headers are unavailable.
```

使用 session store 的 `historyGeneration` 丢弃 force refresh、session switch 或重复 load-more 之后返回的陈旧响应。为初始和历史请求使用同一个可清理 `AbortController` 超时；初始失败写入 `loadError`，历史失败写入 `historyLoadError`。缓存已有消息时保持 `loaded` 状态；force refresh 用 `mergeMessages()` 更新最新快照。

- [x] **步骤 4：运行 hook 测试确认通过**

运行：`npx vitest run src/hooks/useSessionManager.test.tsx`

预期：PASS，覆盖 cursor、旧服务器退路、超时和 force refresh。

### 任务 4：修复历史加载可见性与滚动锚点

**文件：**
- 修改：`src/hooks/useChatSession.ts`
- 修改：`src/features/chat/ChatPane.tsx`
- 修改：`src/features/chat/ChatArea.tsx`
- 修改：`src/features/chat/ChatArea.test.ts`

- [x] **步骤 1：编写失败的纯模型回归测试**

```ts
it('restores the captured anchor when prepending fills an existing page', () => {
  const anchor = { messageId: 'm-21', topOffset: 32, pageCountBefore: 3 }

  expect(shouldRestoreLoadMoreAnchor(anchor, true)).toBe(true)
})
```

- [x] **步骤 2：运行测试确认页数未增加时当前逻辑失败**

运行：`npx vitest run src/features/chat/ChatArea.test.ts`

预期：FAIL，当前实现只在 `activePages.length > anchor.pageCountBefore` 时恢复。

- [x] **步骤 3：实现基于实际 prepend 的锚点恢复**

```ts
function shouldRestoreLoadMoreAnchor(anchor: LoadMoreAnchorSnapshot | null, hasPageUpdate: boolean) {
  return anchor !== null && hasPageUpdate
}
```

移除“page count 必须增加”的前置条件：只要历史结果改变 `activePages` 且已渲染 anchor message，就恢复原来的偏移量。通过 `useChatSession` 和 `ChatPane` 把 `isLoadingHistory`、`historyLoadError` 传到 `ChatArea`；历史失败时在顶部显示错误及重试入口，不隐藏已存在消息。

- [x] **步骤 4：运行聊天区测试确认通过**

运行：`npx vitest run src/features/chat/ChatArea.test.ts`

预期：PASS。

### 任务 5：完整验证

**文件：**
- 修改：无

- [x] **步骤 1：运行聚焦测试**

运行：`npx vitest run src/api/message.test.ts src/hooks/useSessionManager.test.tsx src/store/messageStore.test.ts src/features/chat/ChatArea.test.ts`

预期：PASS。

- [x] **步骤 2：运行类型、代码风格和全量测试**

运行：`npm run validate`

预期：typecheck、lint、81+ 测试文件及 production build 全部通过。

- [ ] **步骤 3：手动验证长会话**

使用 100+ 消息会话：首次加载只请求最新 50 条；每次向上滚动仅请求一个带 `before` 的 50 条页；断线重连后已加载历史不缩短；超时和失败均显示可见重试状态。
