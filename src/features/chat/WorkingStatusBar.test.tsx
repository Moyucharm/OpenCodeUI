import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WorkingStatusBar } from './WorkingStatusBar'

describe('WorkingStatusBar', () => {
  it('renders model activity details without an explicit separator', () => {
    render(<WorkingStatusBar status={{ title: '处理中', detail: '模型回复中', tone: 'working' }} />)

    expect(screen.getByRole('status')).toHaveTextContent('处理中模型回复中')
  })

  it('renders the colon separator for prepared tool names', () => {
    render(<WorkingStatusBar status={{ title: '正在准备', detail: 'bash', separator: 'colon', tone: 'working' }} />)

    expect(screen.getByRole('status')).toHaveTextContent('正在准备：bash')
  })
})
