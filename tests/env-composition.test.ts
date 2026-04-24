import { describe, expect, it } from 'vitest'
import { createConfigResolver, defineConfig, Planner } from 'tsops'

const baseConfig = {
  project: 'demo',
  namespaces: {
    prod: { domain: 'example.com' }
  },
  clusters: {
    prod: { apiServer: 'https://prod:6443', context: 'prod', namespaces: ['prod'] as const }
  },
  images: { registry: 'ghcr.io/acme', tagStrategy: 'git-tag' as const },
  secrets: {
    'app-secrets': { JWT_SECRET: 'shh' },
    'db-secrets': { PASSWORD: 'pw' }
  },
  configMaps: {
    'app-config': { LOG_LEVEL: 'info' },
    defaults: { NODE_ENV: 'production' }
  }
}

async function planFor(envShape: any) {
  const cfg = defineConfig({
    ...baseConfig,
    apps: {
      api: {
        env: envShape,
        ports: [{ name: 'http', port: 80, targetPort: 3000 }]
      }
    }
  })
  const resolver = createConfigResolver(cfg)
  const planner = new Planner({ resolver })
  const plan = await planner.plan({ namespace: 'prod', app: 'api' })
  return plan.entries[0]
}

describe('env composition', () => {
  it('accepts a plain record (existing behavior)', async () => {
    const entry = await planFor({ FOO: 'bar', NODE_ENV: 'production' })
    expect(entry.env).toMatchObject({ FOO: 'bar', NODE_ENV: 'production' })
    expect(entry.envFrom).toEqual([])
  })

  it('accepts a resolver function returning a record', async () => {
    const entry = await planFor(({ project }: any) => ({ PROJECT: project }))
    expect(entry.env).toMatchObject({ PROJECT: 'demo' })
    expect(entry.envFrom).toEqual([])
  })

  it('accepts a single SecretRef at the top level (envFrom)', async () => {
    const entry = await planFor(({ secret }: any) => secret('app-secrets'))
    expect(entry.env).toEqual({})
    expect(entry.envFrom).toHaveLength(1)
    expect(entry.envFrom[0]).toMatchObject({ __type: 'SecretRef', secretName: 'app-secrets' })
  })

  it('accepts an array mixing secrets, configMaps, and plain records', async () => {
    const entry = await planFor(({ secret, configMap }: any) => [
      secret('app-secrets'),
      configMap('defaults'),
      { FOO: 'bar' },
      ({ project }: any) => ({ PROJECT: project })
    ])
    // ConfigMap is functional context — need to pass as array, not nested resolver.
    expect(entry.env).toMatchObject({ FOO: 'bar', PROJECT: 'demo' })
    expect(entry.envFrom).toHaveLength(2)
    expect(entry.envFrom[0]).toMatchObject({ __type: 'SecretRef', secretName: 'app-secrets' })
    expect(entry.envFrom[1]).toMatchObject({ __type: 'ConfigMapRef', configMapName: 'defaults' })
  })

  it('merges duplicate keys with last-wins semantics', async () => {
    const entry = await planFor([
      { NODE_ENV: 'development' },
      { NODE_ENV: 'production', EXTRA: '1' }
    ])
    expect(entry.env).toMatchObject({ NODE_ENV: 'production', EXTRA: '1' })
  })

  it('resolves secrets and configMaps scanned from both env and envFrom', async () => {
    const entry = await planFor(({ secret, configMap }: any) => [
      secret('app-secrets'),
      configMap('app-config'),
      { PASSWORD: secret('db-secrets', 'PASSWORD') }
    ])
    // Both the envFrom refs and the valueFrom ref should get their secret/cm bodies resolved.
    expect(entry.secrets).toHaveProperty('app-secrets')
    expect(entry.secrets).toHaveProperty('db-secrets')
    expect(entry.configMaps).toHaveProperty('app-config')
  })
})
