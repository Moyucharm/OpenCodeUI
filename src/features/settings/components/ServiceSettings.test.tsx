import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_SERVER_ID } from '../../../store/serverStore'
import { ServiceSettings } from './ServiceSettings'

const { invokeMock, serviceStoreMock, useServiceStoreMock, useServerStoreMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  serviceStoreMock: {
    autoStart: true,
    binaryPath: '',
    detectedBinaryPath: 'opencode',
    envVars: [],
    envVarsRecord: {},
    effectiveBinaryPath: 'opencode',
    setAutoStart: vi.fn(),
    setBinaryPath: vi.fn(),
    setDetectedBinaryPath: vi.fn(),
    setEnvVars: vi.fn(),
    setRunning: vi.fn(),
    setStartedByUs: vi.fn(),
    setStarting: vi.fn(),
  },
  useServiceStoreMock: vi.fn(),
  useServerStoreMock: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@tauri-apps/api/core', () => ({
  __esModule: true,
  default: { invoke: (...args: unknown[]) => invokeMock(...args) },
  invoke: (...args: unknown[]) => invokeMock(...args),
}))

vi.mock('../../../hooks', () => ({
  useIsMobile: () => false,
  useServerStore: useServerStoreMock,
}))

vi.mock('../../../store/serviceStore', () => ({
  serviceStore: serviceStoreMock,
  useServiceStore: useServiceStoreMock,
}))

vi.mock('../../../utils/tauri', () => ({
  isTauri: () => true,
}))

vi.mock('../../../utils', () => ({
  apiErrorHandler: vi.fn(),
}))

vi.mock('../../../utils/localServiceUrl', () => ({
  applyLocalServiceUrl: vi.fn(),
}))

describe('ServiceSettings', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    serviceStoreMock.setAutoStart.mockReset()
    serviceStoreMock.setBinaryPath.mockReset()
    serviceStoreMock.setDetectedBinaryPath.mockReset()
    serviceStoreMock.setEnvVars.mockReset()
    serviceStoreMock.setRunning.mockReset()
    serviceStoreMock.setStartedByUs.mockReset()
    serviceStoreMock.setStarting.mockReset()
    useServiceStoreMock.mockReturnValue({
      autoStart: true,
      binaryPath: '',
      detectedBinaryPath: 'opencode',
      envVars: [],
      running: true,
      startedByUs: true,
      starting: false,
    })
    useServerStoreMock.mockReturnValue({
      servers: [{ id: LOCAL_SERVER_ID, name: 'Local', url: 'http://127.0.0.1:4096' }],
    })
    invokeMock.mockImplementation((command: string) => {
      if (command === 'check_opencode_service') return Promise.resolve(true)
      if (command === 'get_service_started_by_us') return Promise.resolve(true)
      if (command === 'detect_opencode_binary') return Promise.resolve('opencode')
      if (command === 'stop_opencode_service') return Promise.resolve(undefined)
      if (command === 'start_opencode_service') {
        return Promise.resolve({ started: true, startedByUs: true, url: 'http://127.0.0.1:4096' })
      }
      return Promise.resolve(undefined)
    })
  })

  it('restarts an opencode service started by this app', async () => {
    render(<ServiceSettings />)

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('check_opencode_service', { url: 'http://127.0.0.1:4096' })
      expect(invokeMock).toHaveBeenCalledWith('get_service_started_by_us')
    })
    invokeMock.mockClear()
    invokeMock.mockImplementation((command: string) => {
      if (command === 'check_opencode_service') return Promise.resolve(false)
      if (command === 'detect_opencode_binary') return Promise.resolve('opencode')
      if (command === 'stop_opencode_service') return Promise.resolve(undefined)
      if (command === 'start_opencode_service') {
        return Promise.resolve({ started: true, startedByUs: true, url: 'http://127.0.0.1:4096' })
      }
      return Promise.resolve(undefined)
    })

    fireEvent.click(screen.getByRole('button', { name: 'common:restart' }))

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('stop_opencode_service')
      expect(invokeMock).toHaveBeenCalledWith('start_opencode_service', {
        url: 'http://127.0.0.1:4096',
        binaryPath: 'opencode',
        envVars: {},
      })
    })

    const stopOrder = invokeMock.mock.invocationCallOrder.find((_, index) => invokeMock.mock.calls[index][0] === 'stop_opencode_service')
    const offlineCheckOrder = invokeMock.mock.invocationCallOrder.find(
      (_, index) => invokeMock.mock.calls[index][0] === 'check_opencode_service',
    )
    const startOrder = invokeMock.mock.invocationCallOrder.find((_, index) => invokeMock.mock.calls[index][0] === 'start_opencode_service')

    expect(stopOrder).toBeLessThan(offlineCheckOrder!)
    expect(offlineCheckOrder).toBeLessThan(startOrder!)
  })
})
