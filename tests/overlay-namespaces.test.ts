import { createConfigResolver, defineConfig, isOverlayNamespace, Planner } from 'tsops'
import { describe, expect, it } from 'vitest'

const baseConfig = {
  project: 'demo',
  namespaces: {
    'ru-stage': { domain: 'stage.example.com', secretName: 'stage' },
    preview: {
      extends: 'ru-stage' as const,
      naming: ({ pr }: { pr: string }) => `pr-${pr}`,
      domain: ({ pr }: { pr: string }) => `pr-${pr}.stage.example.com`,
      fallback: 'ru-stage' as const
    }
  },
  clusters: {
    stage: {
      apiServer: 'https://stage:6443',
      context: 'stage',
      namespaces: ['ru-stage', 'preview'] as const
    }
  },
  images: { registry: 'ghcr.io/acme', tagStrategy: 'git-tag' as const }
}

function makeCfg() {
  return defineConfig({
    ...baseConfig,
    apps: {
      api: {
        env: ({ namespace, domain }) => ({
          NS: namespace as string,
          DOMAIN: domain as string
        }),
        ingress: ({ domain }) => ({ domain: `api.${domain as string}` }),
        ports: [{ name: 'http', port: 80, targetPort: 3000 }]
      },
      web: {
        ingress: ({ domain }) => ({ domain: `web.${domain as string}` }),
        ports: [{ name: 'http', port: 80, targetPort: 3000 }]
      }
    }
  })
}

describe('overlay namespaces (resolver)', () => {
  it('isOverlayNamespace identifies overlays vs static namespaces', () => {
    const cfg = makeCfg()
    expect(isOverlayNamespace(cfg.namespaces['ru-stage'] as any)).toBe(false)
    expect(isOverlayNamespace(cfg.namespaces.preview as any)).toBe(true)
  })

  it('select() omits overlays from the default deploy', () => {
    const cfg = makeCfg()
    const resolver = createConfigResolver(cfg)
    expect(resolver.namespaces.select()).toEqual(['ru-stage'])
  })

  it('resolve() materialises overlay name and domain from runtime vars', () => {
    const cfg = makeCfg()
    const resolver = createConfigResolver(cfg)
    const r = resolver.namespaces.resolve('preview', { pr: '123' })
    expect(r.overlay).toBe(true)
    expect(r.name).toBe('pr-123')
    expect(r.domain).toBe('pr-123.stage.example.com')
    expect(r.base).toBe('ru-stage')
    expect(r.fallback).toBe('ru-stage')
  })

  it('resolve() throws when overlay vars are missing', () => {
    const cfg = makeCfg()
    const resolver = createConfigResolver(cfg)
    expect(() => resolver.namespaces.resolve('preview')).toThrow(/requires runtime vars/)
  })

  it('resolve() rejects names that are not valid DNS-1123 labels', () => {
    const cfg = defineConfig({
      ...baseConfig,
      namespaces: {
        ...baseConfig.namespaces,
        bad: {
          extends: 'ru-stage' as const,
          naming: () => 'NOT_VALID',
          domain: () => 'x.example.com',
          fallback: 'ru-stage' as const
        }
      },
      apps: { api: { ports: [{ name: 'http', port: 80, targetPort: 3000 }] } }
    } as any)
    const resolver = createConfigResolver(cfg)
    expect(() => resolver.namespaces.resolve('bad', { pr: '1' })).toThrow(/DNS-1123/)
  })

  it('resolve() rejects extends pointing at another overlay', () => {
    const cfg = defineConfig({
      ...baseConfig,
      namespaces: {
        ...baseConfig.namespaces,
        nested: {
          extends: 'preview' as const,
          naming: ({ pr }: { pr: string }) => `nested-${pr}`,
          domain: ({ pr }: { pr: string }) => `nested-${pr}.stage.example.com`,
          fallback: 'ru-stage' as const
        }
      },
      apps: { api: { ports: [{ name: 'http', port: 80, targetPort: 3000 }] } }
    } as any)
    const resolver = createConfigResolver(cfg)
    expect(() => resolver.namespaces.resolve('nested', { pr: '1' })).toThrow(
      /extends "preview", which is itself an overlay/
    )
  })

  it('resolve() rejects fallback pointing at another overlay', () => {
    const cfg = defineConfig({
      ...baseConfig,
      namespaces: {
        ...baseConfig.namespaces,
        bad: {
          extends: 'ru-stage' as const,
          naming: ({ pr }: { pr: string }) => `bad-${pr}`,
          domain: () => 'x.example.com',
          fallback: 'preview' as const
        }
      },
      apps: { api: { ports: [{ name: 'http', port: 80, targetPort: 3000 }] } }
    } as any)
    const resolver = createConfigResolver(cfg)
    expect(() => resolver.namespaces.resolve('bad', { pr: '1' })).toThrow(
      /Fallback must be a static namespace/
    )
  })

  it('resolve() rejects fallback pointing at unknown namespace', () => {
    const cfg = defineConfig({
      ...baseConfig,
      namespaces: {
        ...baseConfig.namespaces,
        bad: {
          extends: 'ru-stage' as const,
          naming: ({ pr }: { pr: string }) => `bad-${pr}`,
          domain: () => 'x.example.com',
          fallback: 'does-not-exist' as const
        }
      },
      apps: { api: { ports: [{ name: 'http', port: 80, targetPort: 3000 }] } }
    } as any)
    const resolver = createConfigResolver(cfg)
    expect(() => resolver.namespaces.resolve('bad', { pr: '1' })).toThrow(
      /unknown fallback namespace "does-not-exist"/
    )
  })

  it('plan() with overlay vars produces entries under the resolved namespace', async () => {
    const cfg = makeCfg()
    const resolver = createConfigResolver(cfg)
    const planner = new Planner({ resolver })
    const plan = await planner.plan({ namespace: 'preview', vars: { pr: '42' } })
    expect(plan.entries.length).toBeGreaterThan(0)
    for (const entry of plan.entries) {
      expect(entry.namespace).toBe('pr-42')
    }
    const apiEntry = plan.entries.find((e) => e.app === 'api')!
    expect(apiEntry.env.NS).toBe('pr-42')
    expect(apiEntry.env.DOMAIN).toBe('pr-42.stage.example.com')
  })

  it('createHostContext spreads overlay vars into the app context', () => {
    const cfg = makeCfg()
    const resolver = createConfigResolver(cfg)
    const ctx = resolver.namespaces.createHostContext('preview', {
      vars: { pr: '99', branch: 'feature-x' }
    }) as { pr?: string; branch?: string; namespace: string; domain?: string }
    expect(ctx.namespace).toBe('pr-99')
    expect(ctx.pr).toBe('99')
    expect(ctx.branch).toBe('feature-x')
    expect(ctx.domain).toBe('pr-99.stage.example.com')
  })

  it('plan() with --include marks excluded apps as fallback stubs', async () => {
    const cfg = makeCfg()
    const resolver = createConfigResolver(cfg)
    const planner = new Planner({ resolver })
    const plan = await planner.plan({
      namespace: 'preview',
      vars: { pr: '7' },
      include: ['api']
    })
    const apiEntry = plan.entries.find((e) => e.app === 'api')!
    const webEntry = plan.entries.find((e) => e.app === 'web')!
    expect(apiEntry.fallback).toBeUndefined()
    expect(webEntry.fallback).toEqual({ namespace: 'ru-stage' })
  })

  it('createHostContext does not let --vars override reserved keys', () => {
    const cfg = makeCfg()
    const resolver = createConfigResolver(cfg)
    const ctx = resolver.namespaces.createHostContext('preview', {
      vars: { pr: '5', namespace: 'evil', project: 'evil' }
    }) as { namespace: string; project: string }
    expect(ctx.namespace).toBe('pr-5')
    expect(ctx.project).toBe('demo')
  })

  it('createHostContext: --var domain=... cannot override the resolved overlay domain', () => {
    const cfg = makeCfg()
    const resolver = createConfigResolver(cfg)
    const ctx = resolver.namespaces.createHostContext('preview', {
      vars: { pr: '8', domain: 'evil.example.com' }
    }) as { domain: string }
    expect(ctx.domain).toBe('pr-8.stage.example.com')
  })

  it('appEnvOverride applies non-DATABASE_URL keys even when DATABASE_URL is a typed binding', async () => {
    const cfg = defineConfig({
      ...baseConfig,
      namespaces: {
        'ru-stage': { domain: 'stage.example.com' },
        preview: {
          extends: 'ru-stage' as const,
          naming: ({ pr }: { pr: string }) => `pr-${pr}`,
          domain: ({ pr }: { pr: string }) => `pr-${pr}.stage.example.com`,
          fallback: 'ru-stage' as const,
          database: {
            urlSecret: { name: 'stage', key: 'DATABASE_URL' },
            schema: ({ pr }: { pr: string }) => `pr_${pr}`,
            preDeploy: 'create-schema' as const,
            postDestroy: 'drop-schema' as const,
            appEnvOverride: (
              _vars: { pr: string },
              baseUrl: string | undefined,
              schema: string
            ) => ({
              ...(baseUrl ? { DATABASE_URL: `${baseUrl}?schema=${schema}` } : {}),
              DATABASE_SCHEMA: schema
            })
          }
        }
      },
      apps: {
        api: {
          // DATABASE_URL is a typed SecretRef, not a string — old code would
          // skip the entire override callback. New behaviour: drop only the
          // DATABASE_URL key, keep DATABASE_SCHEMA.
          env: ({ secret }: any) => ({
            DATABASE_URL: secret('app-secrets', 'DATABASE_URL')
          }),
          ports: [{ name: 'http', port: 80, targetPort: 3000 }]
        }
      }
    } as any)
    const resolver = createConfigResolver(cfg)
    const planner = new Planner({ resolver })
    const plan = await planner.plan({ namespace: 'preview', vars: { pr: '7' } })
    const apiEntry = plan.entries.find((e) => e.app === 'api')!
    // DATABASE_URL stays as the original SecretRef binding.
    expect(typeof apiEntry.env.DATABASE_URL).toBe('object')
    // DATABASE_SCHEMA is still applied.
    expect(apiEntry.env.DATABASE_SCHEMA).toBe('pr_7')
  })

  it('appEnvOverride drops empty-string DATABASE_URL outputs', async () => {
    const cfg = defineConfig({
      ...baseConfig,
      namespaces: {
        'ru-stage': { domain: 'stage.example.com' },
        preview: {
          extends: 'ru-stage' as const,
          naming: ({ pr }: { pr: string }) => `pr-${pr}`,
          domain: ({ pr }: { pr: string }) => `pr-${pr}.stage.example.com`,
          fallback: 'ru-stage' as const,
          database: {
            urlSecret: { name: 'stage', key: 'DATABASE_URL' },
            schema: ({ pr }: { pr: string }) => `pr_${pr}`,
            preDeploy: 'create-schema' as const,
            postDestroy: 'drop-schema' as const,
            // Naive override that returns '' when baseUrl is missing.
            appEnvOverride: (
              _vars: { pr: string },
              baseUrl: string | undefined,
              schema: string
            ) => ({
              DATABASE_URL: baseUrl ? `${baseUrl}?schema=${schema}` : '',
              DATABASE_SCHEMA: schema
            })
          }
        }
      },
      apps: {
        api: {
          // No DATABASE_URL at all — override should not silently inject ''.
          ports: [{ name: 'http', port: 80, targetPort: 3000 }]
        }
      }
    } as any)
    const resolver = createConfigResolver(cfg)
    const planner = new Planner({ resolver })
    const plan = await planner.plan({ namespace: 'preview', vars: { pr: '9' } })
    const apiEntry = plan.entries.find((e) => e.app === 'api')!
    expect(apiEntry.env.DATABASE_URL).toBeUndefined()
    expect(apiEntry.env.DATABASE_SCHEMA).toBe('pr_9')
  })

  it('resolve() rejects non-string return from domain()', () => {
    const cfg = defineConfig({
      ...baseConfig,
      namespaces: {
        ...baseConfig.namespaces,
        bad: {
          extends: 'ru-stage' as const,
          naming: ({ pr }: { pr: string }) => `bad-${pr}`,
          // intentionally returns non-string
          domain: () => 42 as unknown as string,
          fallback: 'ru-stage' as const
        }
      },
      apps: { api: { ports: [{ name: 'http', port: 80, targetPort: 3000 }] } }
    } as any)
    const resolver = createConfigResolver(cfg)
    expect(() => resolver.namespaces.resolve('bad', { pr: '1' })).toThrow(
      /produced an invalid domain/
    )
  })
})
