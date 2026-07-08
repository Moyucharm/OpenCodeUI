import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QuestionDialog } from './QuestionDialog'
import type { ApiQuestionRequest } from '../../api'

let sendMessageKey = 'Ctrl+Enter'

vi.mock('./chatViewport', () => ({
  useChatViewport: () => ({
    presentation: { isCompact: false },
  }),
}))

vi.mock('../../hooks', () => ({
  usePresence: (show: boolean) => ({ shouldRender: show, ref: { current: null } }),
}))

vi.mock('../../store/keybindingStore', async importOriginal => {
  const actual = await importOriginal<typeof import('../../store/keybindingStore')>()

  return {
    ...actual,
    keybindingStore: {
      getKey: (action: string) => (action === 'sendMessage' ? sendMessageKey : ''),
    },
    matchesKeybinding: (event: KeyboardEvent, key: string) => {
      if (key === 'Ctrl+Enter') {
        return event.key === 'Enter' && event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey
      }
      if (key === 'Enter') {
        return event.key === 'Enter' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey
      }
      return actual.matchesKeybinding(event, key)
    },
  }
})

function questionRequest(): ApiQuestionRequest {
  return {
    id: 'question-1',
    sessionID: 'session-1',
    questions: [
      {
        header: 'Pick one',
        question: 'Which option?',
        options: [{ label: 'Alpha' }, { label: 'Beta' }],
      },
    ],
  } as ApiQuestionRequest
}

describe('QuestionDialog', () => {
  beforeEach(() => {
    sendMessageKey = 'Ctrl+Enter'
  })

  it('shows the current send-message keybinding on the submit action', () => {
    render(<QuestionDialog request={questionRequest()} onReply={vi.fn()} onReject={vi.fn()} />)

    expect(screen.getByRole('button', { name: /submit/i })).toHaveTextContent('Ctrl + ↵')
  })

  it('submits with the current send-message keybinding', () => {
    const onReply = vi.fn()
    render(<QuestionDialog request={questionRequest()} onReply={onReply} onReject={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }))
    fireEvent.keyDown(screen.getByText('Which option?'), { key: 'Enter', ctrlKey: true })

    expect(onReply).toHaveBeenCalledWith([['Alpha']])
  })
})
