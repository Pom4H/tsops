import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'

import { SecretManager } from '../src/core/secret-manager.js'

class FakeExecutor {
  public lastRunCommand: string | undefined
  public lastRunInput: string | undefined
  public lastCaptureCommand: string | undefined
  private readonly captureMap = new Map<string, { stdout: string; stderr: string }>()

  setCaptureResponse(command: string, stdout: string, stderr = ''): void {
    this.captureMap.set(command, { stdout, stderr })
  }

  async run(command: string, options?: { input?: string }): Promise<void> {
    this.lastRunCommand = command
    this.lastRunInput = options?.input
  }

  async capture(command: string): Promise<{ stdout: string; stderr: string }> {
    this.lastCaptureCommand = command
    const entry = this.captureMap.get(command)
    if (!entry) {
      throw new Error(`No capture response configured for command: ${command}`)
    }
    return entry
  }
}

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
}

describe('SecretManager', () => {
  it('applies secrets via kubectl using stringData', async () => {
    const executor = new FakeExecutor()
    const manager = new SecretManager(executor as unknown as any, logger)

    await manager.upsertSecret({
      context: 'dev-context',
      namespace: 'demo',
      name: 'app-credentials',
      data: {
        username: 'demo-user',
        password: 'p@ssw0rd'
      },
      options: {
        type: 'Opaque',
        labels: { app: 'demo' },
        annotations: { 'secret.tsops.dev/managed': 'true' }
      }
    })

    expect(executor.lastRunCommand).toBe(
      'kubectl --context dev-context --namespace demo apply -f -'
    )
    expect(executor.lastRunInput).toBe(
      JSON.stringify(
        {
          apiVersion: 'v1',
          kind: 'Secret',
          metadata: {
            name: 'app-credentials',
            namespace: 'demo',
            labels: { app: 'demo' },
            annotations: { 'secret.tsops.dev/managed': 'true' }
          },
          type: 'Opaque',
          stringData: {
            username: 'demo-user',
            password: 'p@ssw0rd'
          }
        },
        null,
        2
      )
    )
  })

  it('decodes secret data returned from kubectl get', async () => {
    const executor = new FakeExecutor()
    const manager = new SecretManager(executor as unknown as any, logger)

    const command =
      'kubectl --context dev-context --namespace demo get secret app-credentials -o json'
    executor.setCaptureResponse(
      command,
      JSON.stringify({
        type: 'kubernetes.io/basic-auth',
        metadata: {
          labels: { app: 'demo' },
          annotations: { 'secret.tsops.dev/managed': 'true' }
        },
        data: {
          username: Buffer.from('demo-user').toString('base64'),
          password: Buffer.from('p@ssw0rd').toString('base64')
        }
      })
    )

    const result = await manager.readSecret({
      context: 'dev-context',
      namespace: 'demo',
      name: 'app-credentials'
    })

    expect(executor.lastCaptureCommand).toBe(command)
    expect(result.type).toBe('kubernetes.io/basic-auth')
    expect(result.data).toEqual({ username: 'demo-user', password: 'p@ssw0rd' })
    expect(result.metadata).toEqual({
      labels: { app: 'demo' },
      annotations: { 'secret.tsops.dev/managed': 'true' }
    })
  })

  it('deletes secrets and can ignore missing resources', async () => {
    const executor = new FakeExecutor()
    const manager = new SecretManager(executor as unknown as any, logger)

    await manager.deleteSecret({
      context: 'dev-context',
      namespace: 'demo',
      name: 'stale-secret',
      options: { ignoreNotFound: true }
    })

    expect(executor.lastRunCommand).toBe(
      'kubectl --context dev-context --namespace demo delete secret stale-secret --ignore-not-found'
    )
  })
})
