import type { ApiPermissionRequest, ApiQuestionRequest } from '../../api'
import type { Message, ToolPart } from '../../types/message'
import type { SessionStatus } from '../../types/api/session'

export type WorkingStatusTone = 'working' | 'permission' | 'retry'

export interface WorkingStatusInfo {
  title: string
  detail?: string
  tone: WorkingStatusTone
}

interface WorkingStatusInput {
  isStreaming: boolean
  messages: Message[]
  routeStatus?: SessionStatus
  pendingPermissionRequests?: ApiPermissionRequest[]
  pendingQuestionRequests?: ApiQuestionRequest[]
}

function titleCaseToolName(tool: string): string {
  return tool
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim()
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

function getToolDetail(part: ToolPart): string {
  const verb = part.state.status === 'pending' ? 'Preparing' : 'Running'
  const name = titleCaseToolName(part.tool) || 'Tool'
  const title = part.state.title?.trim()
  return title ? `${verb} ${name}: ${title}` : `${verb} ${name}`
}

function getRetryDetail(routeStatus: SessionStatus): string | undefined {
  if (routeStatus.type !== 'retry') return undefined
  const attempt = typeof routeStatus.attempt === 'number' ? `Attempt ${routeStatus.attempt}` : 'Retrying'
  return routeStatus.message ? `${attempt}: ${routeStatus.message}` : attempt
}

export function getWorkingStatus({
  isStreaming,
  messages,
  routeStatus,
  pendingPermissionRequests = [],
  pendingQuestionRequests = [],
}: WorkingStatusInput): WorkingStatusInfo | null {
  const permission = pendingPermissionRequests[0]
  if (permission) {
    const pattern = permission.patterns?.[0] ? ` ${permission.patterns[0]}` : ''
    return { title: 'Needs approval', detail: `Waiting for permission: ${permission.permission}${pattern}`, tone: 'permission' }
  }

  const question = pendingQuestionRequests[0]
  if (question) {
    const header = question.questions?.[0]?.header?.trim()
    return { title: 'Needs input', detail: header ? `Waiting for answer: ${header}` : undefined, tone: 'permission' }
  }

  if (routeStatus?.type === 'retry') {
    return { title: 'Retrying', detail: getRetryDetail(routeStatus), tone: 'retry' }
  }

  const isWorking = isStreaming || routeStatus?.type === 'busy'
  const activeTool = isWorking ? getActiveTool(messages) : null
  if (activeTool) return { title: 'Working', detail: getToolDetail(activeTool), tone: 'working' }

  if (isWorking) return { title: 'Working', tone: 'working' }

  return null
}
