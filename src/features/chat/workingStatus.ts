import type { ApiPermissionRequest, ApiQuestionRequest } from '../../api'
import type { RuntimeActivity } from '../../store/runtimeActivityStore'
import type { Message, ToolPart } from '../../types/message'
import type { SessionStatus } from '../../types/api/session'

export type WorkingStatusTone = 'working' | 'permission' | 'retry'

export interface WorkingStatusInfo {
  title: string
  detail?: string
  separator?: 'colon'
  tone: WorkingStatusTone
}

interface WorkingStatusInput {
  isStreaming: boolean
  messages: Message[]
  routeStatus?: SessionStatus
  pendingPermissionRequests?: ApiPermissionRequest[]
  pendingQuestionRequests?: ApiQuestionRequest[]
  runtimeActivity?: RuntimeActivity | null
}

function getToolName(tool: string): string {
  return tool.trim() || 'tool'
}

function getActiveTool(messages: Message[]): ToolPart | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.info.role !== 'assistant') continue
    for (let j = message.parts.length - 1; j >= 0; j--) {
      const part = message.parts[j]
      if (part.type === 'tool' && (part.state.status === 'pending' || part.state.status === 'running')) return part
    }
  }
  return null
}

function getLatestAssistantMessage(messages: Message[]): Message | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.info.role === 'assistant') return message
  }
  return null
}

function hasAssistantAfterLatestUser(messages: Message[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const role = messages[i].info.role
    if (role === 'assistant') return true
    if (role === 'user') return false
  }
  return false
}

function getActiveTaskDetail(part: ToolPart): string | undefined {
  const input = part.state.input as Record<string, unknown> | undefined
  const agent = typeof input?.subagent_type === 'string' ? input.subagent_type.trim() : ''
  const description = typeof input?.description === 'string' ? input.description.trim() : ''
  if (agent && description) return `${agent}：${description}`
  return agent || description || undefined
}

function getToolDetail(part: ToolPart): string {
  const verb = part.state.status === 'pending' ? '正在准备' : '正在运行'
  const name = getToolName(part.tool)
  const title = part.state.title?.trim()
  return title ? `${verb} ${name}：${title}` : `${verb} ${name}`
}

function getRetryDetail(routeStatus: SessionStatus): string | undefined {
  if (routeStatus.type !== 'retry') return undefined
  const attempt = typeof routeStatus.attempt === 'number' ? `第 ${routeStatus.attempt} 次尝试` : '正在重试'
  return routeStatus.message ? `${attempt}：${routeStatus.message}` : attempt
}

export function getWorkingStatus({
  isStreaming,
  messages,
  routeStatus,
  pendingPermissionRequests = [],
  pendingQuestionRequests = [],
  runtimeActivity,
}: WorkingStatusInput): WorkingStatusInfo | null {
  const permission = pendingPermissionRequests[0]
  if (permission) {
    const pattern = permission.patterns?.[0] ? ` ${permission.patterns[0]}` : ''
    return { title: '需要确认', detail: `等待权限确认：${permission.permission}${pattern}`, tone: 'permission' }
  }

  const question = pendingQuestionRequests[0]
  if (question) {
    const header = question.questions?.[0]?.header?.trim()
    return { title: '需要输入', detail: header ? `等待回答：${header}` : undefined, tone: 'permission' }
  }

  if (routeStatus?.type === 'retry') {
    return { title: '正在重试', detail: getRetryDetail(routeStatus), tone: 'retry' }
  }

  if (runtimeActivity?.type === 'compaction') {
    return { title: '压缩上下文...', tone: 'working' }
  }

  const isWorking = isStreaming || routeStatus?.type === 'busy'
  const activeTool = isWorking ? getActiveTool(messages) : null
  if (activeTool?.tool.toLowerCase() === 'task') {
    return { title: '子代理处理中', detail: getActiveTaskDetail(activeTool), separator: 'colon', tone: 'working' }
  }

  if (activeTool) return { title: '处理中', detail: getToolDetail(activeTool), tone: 'working' }

  if (runtimeActivity?.type === 'tool-input') {
    return { title: '正在准备', detail: getToolName(runtimeActivity.toolName), separator: 'colon', tone: 'working' }
  }

  if (isWorking) {
    if (!hasAssistantAfterLatestUser(messages)) {
      return { title: '正在等待模型回应', tone: 'working' }
    }

    const latestAssistant = getLatestAssistantMessage(messages)
    const latestAssistantParts = latestAssistant?.parts ?? []
    if (latestAssistantParts.length === 0) {
      return { title: '正在等待模型回应', tone: 'working' }
    }
    if (latestAssistantParts.some(part => part.type === 'reasoning')) {
      return { title: '处理中', detail: '模型回复中', tone: 'working' }
    }
    if (latestAssistantParts.some(part => part.type === 'text')) {
      return { title: '处理中', detail: '模型回复中', tone: 'working' }
    }
  }

  if (isWorking) return { title: '正在准备', tone: 'working' }

  return null
}
