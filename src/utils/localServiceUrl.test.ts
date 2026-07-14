import { beforeEach, describe, expect, it, vi } from 'vitest'

const setLocalServerRuntimeUrl = vi.fn()
const checkHealth = vi.fn()

vi.mock('../store/serverStore', () => ({
  LOCAL_SERVER_ID: 'local',
  serverStore: {
    setLocalServerRuntimeUrl,
    checkHealth,
  },
}))

describe('applyLocalServiceUrl', () => {
  beforeEach(() => {
    setLocalServerRuntimeUrl.mockReset()
    checkHealth.mockReset()
  })

  it('checks health even when the detected local URL is unchanged', async () => {
    setLocalServerRuntimeUrl.mockReturnValue(false)
    const { applyLocalServiceUrl } = await import('./localServiceUrl')

    applyLocalServiceUrl('http://127.0.0.1:4096')

    expect(setLocalServerRuntimeUrl).toHaveBeenCalledWith('http://127.0.0.1:4096')
    expect(checkHealth).toHaveBeenCalledWith('local')
  })

  it('does nothing for an empty URL', async () => {
    const { applyLocalServiceUrl } = await import('./localServiceUrl')

    applyLocalServiceUrl(null)

    expect(setLocalServerRuntimeUrl).not.toHaveBeenCalled()
    expect(checkHealth).not.toHaveBeenCalled()
  })
})
