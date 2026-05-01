import { createConfigResolver, defineConfig, Planner, scanBuildEnv, scanRuntimeEnv } from 'tsops'
import { describe, expect, it } from 'vitest'

describe('sensitive-env scanning', () => {
  it('flags plain-string build env with suspicious keys', () => {
    const findings = scanBuildEnv(
      'api',
      {
        type: 'dockerfile',
        context: '.',
        dockerfile: 'Dockerfile',
        env: {
          NODE_ENV: 'production', // safe
          TURBO_TOKEN: 'abc123', // flagged
          NEXT_PUBLIC_API_KEY: 'public-ok' // prefix-allowed
        }
      },
      undefined
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].key).toBe('TURBO_TOKEN')
    expect(findings[0].source).toBe('build')
  })

  it('respects allowKeys', () => {
    const findings = scanBuildEnv(
      'api',
      {
        type: 'dockerfile',
        context: '.',
        dockerfile: 'Dockerfile',
        env: { TURBO_TOKEN: 'abc' }
      },
      { allowKeys: ['TURBO_TOKEN'] }
    )
    expect(findings).toEqual([])
  })

  it('skips entirely when mode is off', () => {
    const findings = scanBuildEnv(
      'api',
      {
        type: 'dockerfile',
        context: '.',
        dockerfile: 'Dockerfile',
        env: { SECRET_TOKEN: 'x' }
      },
      { mode: 'off' }
    )
    expect(findings).toEqual([])
  })

  it('flags plain-string runtime env but not secret-backed values', () => {
    const findings = scanRuntimeEnv(
      {
        app: 'api',
        namespace: 'prod',
        image: 'img',
        env: {
          JWT_SECRET: 'literal-secret', // flagged
          API_KEY: { __type: 'SecretRef', secretName: 's' } as any, // safe (ref)
          LOG_LEVEL: 'info' // doesn't match pattern
        },
        envFrom: [],
        secrets: {},
        configMaps: {}
      },
      undefined
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].key).toBe('JWT_SECRET')
  })

  it('planner integration: warns by default, attaches findings to PlanResult', async () => {
    const cfg = defineConfig({
      project: 'demo',
      namespaces: { prod: { domain: 'example.com' } },
      clusters: {
        prod: { apiServer: 'https://p:6443', context: 'p', namespaces: ['prod'] as const }
      },
      images: { registry: 'ghcr.io/acme', tagStrategy: 'git-tag' as const },
      validation: {
        sensitiveEnv: { mode: 'warn' }
      },
      apps: {
        api: {
          env: { API_KEY: 'plain-leaked' },
          ports: [{ name: 'http', port: 80, targetPort: 3000 }]
        }
      }
    })

    const resolver = createConfigResolver(cfg)
    const planner = new Planner({ resolver, config: cfg })
    const plan = await planner.plan()
    expect(plan.warnings).toBeDefined()
    expect(plan.warnings!.some((f) => f.key === 'API_KEY')).toBe(true)
  })

  it('planner integration: error mode throws an aggregated error', async () => {
    const cfg = defineConfig({
      project: 'demo',
      namespaces: { prod: { domain: 'example.com' } },
      clusters: {
        prod: { apiServer: 'https://p:6443', context: 'p', namespaces: ['prod'] as const }
      },
      images: { registry: 'ghcr.io/acme', tagStrategy: 'git-tag' as const },
      validation: {
        sensitiveEnv: { mode: 'error' }
      },
      apps: {
        api: {
          env: { API_KEY: 'plain-leaked' },
          ports: [{ name: 'http', port: 80, targetPort: 3000 }]
        }
      }
    })

    const resolver = createConfigResolver(cfg)
    const planner = new Planner({ resolver, config: cfg })
    await expect(planner.plan()).rejects.toThrow(/sensitive-env/i)
  })
})
