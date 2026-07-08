import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatViewportProvider, type ChatViewportValue } from '../features/chat/chatViewport'
import { OutlineIndex } from './OutlineIndex'

const viewport: ChatViewportValue = {
  presentation: {
    surfaceVariant: 'desktop',
    isCompact: false,
  },
  interaction: {
    mode: 'pointer',
    touchCapable: false,
    sidebarBehavior: 'docked',
    rightPanelBehavior: 'docked',
    bottomPanelBehavior: 'docked',
    outlineInteraction: 'pointer',
    enableCollapsedInputDock: false,
  },
  layout: {
    viewportWidth: 1280,
    viewportHeight: 800,
    surfaceWidth: 900,
    surfaceMinWidth: 380,
    sidebar: {
      railWidth: 49,
      requestedWidth: 288,
      openWidth: 288,
      dockedWidth: 49,
      overlayWidth: 288,
      hardMinWidth: 160,
      preferredMinWidth: 240,
      maxWidth: 480,
      resizeMaxWidth: 480,
    },
    rightPanel: {
      requestedWidth: 0,
      dockedWidth: 0,
      hardMinWidth: 160,
      maxWidth: 1280,
      resizeMaxWidth: 830,
    },
    bottomPanel: {
      maxHeight: 420,
    },
  },
  actions: {
    setSidebarRequestedWidth: vi.fn(),
  },
}

function renderOutline(ui: React.ReactNode, value: ChatViewportValue = viewport) {
  return render(<ChatViewportProvider value={value}>{ui}</ChatViewportProvider>)
}

describe('OutlineIndex', () => {
  it('shows a scroll-to-bottom tick that matches the outline item structure and triggers it', () => {
    const onScrollToBottom = vi.fn()

    const { container } = renderOutline(
      <OutlineIndex
        sourceEntries={[
          { messageId: 'first', title: 'First prompt' },
          { messageId: 'second', title: 'Second prompt' },
        ]}
        visibleMessageIds={['first']}
        onScrollToMessageId={vi.fn()}
        showScrollToBottom
        onScrollToBottom={onScrollToBottom}
      />,
    )

    const button = screen.getByRole('button', { name: 'Scroll to bottom' })

    expect(button).toHaveAttribute('data-oi-scroll-bottom', 'true')
    expect(button).toHaveAttribute('data-oi-item')
    expect(button.querySelector('[data-oi-tick]')).toBeInTheDocument()
    expect(button.querySelector('[data-oi-label]')).toHaveTextContent('Scroll to bottom')
    expect(button).not.toHaveTextContent('↓')
    expect(container.querySelector('[data-oi-rail="true"]')).not.toBeNull()

    fireEvent.click(button)

    expect(onScrollToBottom).toHaveBeenCalledTimes(1)
  })

  it('triggers scroll-to-bottom when the pointer fisheye zone selects the scroll tick', () => {
    const onScrollToBottom = vi.fn()
    const onScrollToMessageId = vi.fn()

    const { container } = renderOutline(
      <OutlineIndex
        sourceEntries={[
          { messageId: 'first', title: 'First prompt' },
          { messageId: 'second', title: 'Second prompt' },
        ]}
        visibleMessageIds={['first']}
        onScrollToMessageId={onScrollToMessageId}
        showScrollToBottom
        onScrollToBottom={onScrollToBottom}
      />,
    )

    const rail = container.querySelector<HTMLElement>('[data-oi-rail="true"]')
    const zone = rail?.parentElement?.parentElement

    expect(zone).toBeInTheDocument()

    fireEvent.mouseEnter(rail!, { clientY: 11 })
    fireEvent.click(zone!)

    expect(onScrollToBottom).toHaveBeenCalledTimes(1)
    expect(onScrollToMessageId).not.toHaveBeenCalled()
  })

  it('hides the scroll-to-bottom tick when the chat is already at the bottom', () => {
    renderOutline(
      <OutlineIndex
        sourceEntries={[
          { messageId: 'first', title: 'First prompt' },
          { messageId: 'second', title: 'Second prompt' },
        ]}
        visibleMessageIds={['first']}
        onScrollToMessageId={vi.fn()}
        showScrollToBottom={false}
        onScrollToBottom={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Scroll to bottom' })).not.toBeInTheDocument()
  })

  it('hides the scroll-to-bottom control when the outline is hidden', () => {
    renderOutline(
      <OutlineIndex
        sourceEntries={[{ messageId: 'first', title: 'First prompt' }]}
        onScrollToMessageId={vi.fn()}
        showScrollToBottom
        onScrollToBottom={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Scroll to bottom' })).not.toBeInTheDocument()
  })

  it('keeps the scroll-to-bottom tick from selecting a message in touch mode', () => {
    const onScrollToBottom = vi.fn()
    const onScrollToMessageId = vi.fn()
    const touchViewport: ChatViewportValue = {
      ...viewport,
      interaction: {
        ...viewport.interaction,
        mode: 'touch',
        touchCapable: true,
        outlineInteraction: 'touch',
      },
    }

    const { container } = renderOutline(
      <OutlineIndex
        sourceEntries={[
          { messageId: 'first', title: 'First prompt' },
          { messageId: 'second', title: 'Second prompt' },
        ]}
        visibleMessageIds={['first']}
        onScrollToMessageId={onScrollToMessageId}
        showScrollToBottom
        onScrollToBottom={onScrollToBottom}
      />,
      touchViewport,
    )

    const button = screen.getByRole('button', { name: 'Scroll to bottom' })
    const rail = container.querySelector('[data-oi-rail="true"]')

    expect(rail).toContainElement(button)
    expect(button.querySelector('[data-oi-tick]')).toBeInTheDocument()

    fireEvent.click(button)

    expect(onScrollToBottom).toHaveBeenCalledTimes(1)
    expect(onScrollToMessageId).not.toHaveBeenCalled()
  })

  it('triggers scroll-to-bottom when touch fisheye release selects the scroll tick', () => {
    const onScrollToBottom = vi.fn()
    const onScrollToMessageId = vi.fn()
    const touchViewport: ChatViewportValue = {
      ...viewport,
      interaction: {
        ...viewport.interaction,
        mode: 'touch',
        touchCapable: true,
        outlineInteraction: 'touch',
      },
    }

    const { container } = renderOutline(
      <OutlineIndex
        sourceEntries={[
          { messageId: 'first', title: 'First prompt' },
          { messageId: 'second', title: 'Second prompt' },
        ]}
        visibleMessageIds={['first']}
        onScrollToMessageId={onScrollToMessageId}
        showScrollToBottom
        onScrollToBottom={onScrollToBottom}
      />,
      touchViewport,
    )

    const rail = container.querySelector<HTMLElement>('[data-oi-rail="true"]')

    expect(rail).toBeInTheDocument()

    fireEvent.touchStart(rail!, { touches: [{ clientY: 11 }] })
    fireEvent.touchEnd(document)

    expect(onScrollToBottom).toHaveBeenCalledTimes(1)
    expect(onScrollToMessageId).not.toHaveBeenCalled()
  })
})
