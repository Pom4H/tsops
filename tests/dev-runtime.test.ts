import { createRuntimeHelpers } from '@tsops/core'
import { defineConfig } from 'tsops'
import { describe, expect, it } from 'vitest'
import {
  buildRouteName,
  createDevPlan,
  selectLocalNamespace
} from '../packages/cli/src/dev.js'

describe('tsops dev planning', () => {
  it('selects the only local namespace and creates stable route names', () => {
    const config = {
      project: 'Demo App',
      namespaces: {
        dev: { runtime: 'local' },
        prod: { runtime: 'kubernetes' }
      },
      apps: {
        API_v2: {
          dev: ['bun', 'run', 'dev']
        },
        worker: {
          dev: false
        }
      }
    }

    expect(selectLocalNamespace(config)).toBe('dev')
    expect(buildRouteName(config.project, 'API_v2')).toBe('api-v2.demo-app')

    const plan = createDevPlan(config, { cwd: '/workspace' })
    expect(plan.namespace).toBe('dev')
    expect(plan.entries).toEqual([
      {
        app: 'API_v2',
        route: 'api-v2.demo-app',
        command: 'bun',
        args: ['run', 'dev'],
        cwd: '/workspace'
      }
    ])
  })

  it('requires --namespace when more than one local namespace exists', () => {
    const config = {
      project: 'demo',
      namespaces: {
        local: { runtime: 'local' },
        integration: { runtime: 'local' }
      },
      apps: {}
    }

    expect(() => selectLocalNamespace(config)).toThrow('Multiple local namespaces found')
    expect(selectLocalNamespace(config, 'integration')).toBe('integration')
  })
})

describe('local runtime URL overrides', () => {
  it('uses TSOPS_DEV_URLS for service discovery under tsops dev', () => {
    const config = defineConfig({
      project: 'demo',
      namespaces: {
        dev: { runtime: 'local' },
        prod: { runtime: 'kubernetes' }
      },
      clusters: {
        local: {
          apiServer: 'https://127.0.0.1:6443',
          context: 'local',
          namespaces: ['dev']
        },
        prod: {
          apiServer: 'https://cluster.example.com',
          context: 'prod',
          namespaces: ['prod']
        }
      },
      images: {
        registry: 'ghcr.io/acme',
        tagStrategy: 'git-sha'
      },
      apps: {
        api: {
          ports: [{ name: 'http', port: 80, targetPort: 3000 }]
        }
      }
    })

    const previous = process.env.TSOPS_DEV_URLS
    process.env.TSOPS_DEV_URLS = JSON.stringify({
      api: 'https://feature-auth.api.demo.localhost'
    })

    try {
      const helpers = createRuntimeHelpers(config, 'dev')
      expect(helpers.dns('api', 'service')).toBe('feature-auth.api.demo.localhost')
      expect(helpers.url('api', 'service')).toBe('https://feature-auth.api.demo.localhost')
      expect(helpers.url('api', 'cluster')).toBe('https://feature-auth.api.demo.localhost')
      expect(helpers.url('api', 'service', { protocol: 'http' })).toBe(
        'http://feature-auth.api.demo.localhost'
      )
    } finally {
      if (previous === undefined) delete process.env.TSOPS_DEV_URLS
      else process.env.TSOPS_DEV_URLS = previous
    }
  })

  it('keeps localhost port semantics when tsops dev is not active', () => {
    const previous = process.env.TSOPS_DEV_URLS
    delete process.env.TSOPS_DEV_URLS

    try {
      const config = defineConfig({
        project: 'demo',
        namespaces: { dev: { runtime: 'local' } },
        clusters: {
          local: {
            apiServer: 'https://127.0.0.1:6443',
            context: 'local',
            namespaces: ['dev']
          }
        },
        images: {
          registry: 'ghcr.io/acme',
          tagStrategy: 'git-sha'
        },
        apps: {
          api: {
            ports: [{ name: 'http', port: 80, targetPort: 3000 }]
          }
        }
      })

      const helpers = createRuntimeHelpers(config, 'dev')
      expect(helpers.url('api', 'service')).toBe('http://localhost:3000')
    } finally {
      if (previous !== undefined) process.env.TSOPS_DEV_URLS = previous
    }
  })
})
