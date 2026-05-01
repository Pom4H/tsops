import { defineConfig } from 'tsops'
import { describe, expect, it } from 'vitest'

// Create a comprehensive config using most features
const cfg = defineConfig({
  project: 'demo',
  namespaces: {
    dev: { local: true, domain: 'dev.example.com', replicas: 1 },
    prod: { local: false, domain: 'example.com', replicas: 3 }
  },
  clusters: {
    dev: {
      apiServer: 'https://dev.local:6443',
      context: 'docker-desktop',
      namespaces: ['dev']
    },
    prod: {
      apiServer: 'https://prod.local:6443',
      context: 'prod',
      namespaces: ['prod']
    }
  },
  images: {
    registry: 'ghcr.io/acme',
    tagStrategy: 'git-tag',
    includeProjectInName: false
  },
  secrets: {
    'shared-secrets': { SHARED_KEY: 'shared' },
    'token-secrets': { PROJECT: 'demo' }
  },
  configMaps: {
    'app-settings': { LOG_LEVEL: 'info' },
    'namespace-flags': { NAMESPACE: 'dev' }
  },
  apps: {
    api: {
      build: { type: 'dockerfile', context: '.', dockerfile: 'Dockerfile' },
      env: ({ secret, configMap, url, project, domain }) => ({
        NODE_ENV: 'production',
        TOKEN: secret('token-secrets', 'PROJECT'),
        SHARED_KEY: secret('shared-secrets', 'SHARED_KEY'),
        LOG_LEVEL: configMap('app-settings', 'LOG_LEVEL'),
        NAMESPACE: configMap('namespace-flags', 'NAMESPACE'),
        ENDPOINT: url('api', 'service'),
        PROJECT: project,
        HOST: `api.${domain}`
      }),
      ingress: ({ domain }) => ({ domain: `api.${domain}` }),
      ports: [{ name: 'http', port: 80, targetPort: 8080 }]
    },
    web: {
      ingress: ({ domain }) => ({ domain: `web.${domain}` }),
      // envFrom: entire configMap
      env: ({ configMap }) => configMap('namespace-flags'),
      ports: [{ name: 'http', port: 80, targetPort: 3000 }]
    },
    admin: {
      // Explicit protocol override: force http for production domain
      ingress: ({ domain }) => ({
        domain: `admin.${domain}`,
        protocol: 'http'
      }),
      ports: [{ name: 'http', port: 80, targetPort: 9000 }]
    },
    worker: {
      // App without ingress (internal service only)
      ports: [{ name: 'http', port: 80, targetPort: 5000 }]
    },
    'no-ports-app': {
      // App without ports (for testing port() error handling)
      env: () => ({ TEST: 'value' })
    },
    conditional: {
      // Conditional ingress that might return undefined
      ingress: ({ domain }) => {
        return domain.includes('example.com')
          ? { domain: `conditional.${domain}` }
          : (undefined as any)
      },
      ports: [{ name: 'http', port: 80, targetPort: 6000 }]
    },
    'local-service': {
      // Service with explicit port for local development
      ingress: ({ domain, namespace }) => ({
        domain,
        port: namespace === 'dev' ? 3001 : undefined
      }),
      ports: [{ name: 'http', port: 80, targetPort: 3000 }]
    },
    'dynamic-ports': {
      // Service with dynamic ports based on namespace
      ingress: ({ domain, namespace }) => ({
        domain: `dynamic.${domain}`,
        port: namespace === 'dev' ? 4000 : undefined
      }),
      ports: ({ namespace }) => [
        {
          name: 'http',
          port: 80,
          targetPort: namespace === 'dev' ? 4000 : 3000
        }
      ]
    },
    'string-port-format': {
      // Service using string port format "service:container"
      ports: ({ namespace }) => [
        {
          name: 'http',
          port: namespace === 'dev' ? '8080:3000' : 80
        }
      ]
    },
    metrics: {
      // Multi-port app with named ports
      ports: [
        { name: 'http', port: 80, targetPort: 3000 },
        { name: 'metrics', port: 9090, targetPort: 9090 }
      ]
    },
    'with-local-port': {
      // Explicit localPort to disambiguate services on localhost
      ports: [{ name: 'http', port: 80, targetPort: 3000, localPort: 3050 }]
    }
  }
})

function withNamespace<T>(ns: string, fn: () => T): T {
  const prev = process.env.TSOPS_NAMESPACE
  process.env.TSOPS_NAMESPACE = ns
  try {
    return fn()
  } finally {
    if (prev === undefined) delete process.env.TSOPS_NAMESPACE
    else process.env.TSOPS_NAMESPACE = prev
  }
}

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const prev: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try {
    return fn()
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

describe('defineConfig runtime API', () => {
  it('preserves structure and methods', () => {
    expect(cfg.project).toBe('demo')
    expect(Object.keys(cfg.namespaces)).toEqual(['dev', 'prod'])
    expect(Object.keys(cfg.clusters)).toEqual(['dev', 'prod'])
    expect(cfg.images.registry).toBe('ghcr.io/acme')

    expect(typeof cfg.env).toBe('function')
    expect(typeof cfg.dns).toBe('function')
    expect(typeof cfg.url).toBe('function')
    expect(typeof cfg.servicePort).toBe('function')
    expect(typeof cfg.targetPort).toBe('function')
    expect(typeof cfg.listenPort).toBe('function')
  })

  it('resolves runtime for dev (local namespace)', () => {
    withNamespace('dev', () => {
      // In local mode (local: true → runtime: 'local'), everything hits localhost.
      expect(cfg.dns('api', 'service')).toBe('localhost')
      expect(cfg.dns('api', 'ingress')).toBe('localhost')

      // Service URL uses localPort ?? containerPort. api has no localPort → 8080.
      expect(cfg.url('api', 'service')).toBe('http://localhost:8080')
      // Ingress URL omits port unless explicit; api has none → https://localhost.
      expect(cfg.url('api', 'ingress')).toBe('https://localhost')

      withEnv(
        {
          ENDPOINT: 'http://from-env-endpoint',
          HOST: 'host.from.env',
          NODE_ENV: 'production',
          SHARED_KEY: 'shared-from-env',
          TOKEN: 'token-from-env',
          LOG_LEVEL: 'debug',
          NAMESPACE: 'dev',
          PROJECT: 'demo-env'
        },
        () => {
          expect(cfg.env('api', 'ENDPOINT')).toBe('http://from-env-endpoint')
          expect(cfg.env('api', 'HOST')).toBe('host.from.env')
          expect(cfg.env('api', 'NODE_ENV')).toBe('production')
          expect(cfg.env('api', 'SHARED_KEY')).toBe('shared-from-env')
          expect(cfg.env('api', 'TOKEN')).toBe('token-from-env')
          expect(cfg.env('api', 'LOG_LEVEL')).toBe('debug')
          expect(cfg.env('api', 'NAMESPACE')).toBe('dev')
          expect(cfg.env('api', 'PROJECT')).toBe('demo-env')
        }
      )
    })
  })

  it('resolves runtime for prod (kubernetes namespace)', () => {
    withNamespace('prod', () => {
      expect(cfg.dns('api', 'service')).toBe('api')
      expect(cfg.dns('api', 'cluster')).toBe('api.prod.svc.cluster.local')
      expect(cfg.dns('api', 'ingress')).toBe('api.example.com')

      // kubernetes runtime uses servicePort. 80 is default → omitted.
      expect(cfg.url('api', 'service')).toBe('http://api')
      expect(cfg.url('api', 'cluster')).toBe('http://api.prod.svc.cluster.local')
      expect(cfg.url('api', 'ingress')).toBe('https://api.example.com')
    })
  })

  it('respects explicit protocol in ingress', () => {
    withNamespace('prod', () => {
      // admin app has explicit protocol: 'http' even for production domain
      expect(cfg.dns('admin', 'ingress')).toBe('admin.example.com')
      expect(cfg.url('admin', 'ingress')).toBe('http://admin.example.com')
    })

    withNamespace('dev', () => {
      expect(cfg.dns('admin', 'ingress')).toBe('localhost')
      expect(cfg.url('admin', 'ingress')).toBe('http://localhost')
    })
  })

  it('handles apps without ingress gracefully', () => {
    withNamespace('prod', () => {
      expect(() => cfg.dns('worker', 'ingress')).toThrow()
      expect(() => cfg.url('worker', 'ingress')).toThrow()

      // worker: servicePort=80 → port omitted in URL.
      expect(cfg.dns('worker', 'service')).toBe('worker')
      expect(cfg.url('worker', 'service')).toBe('http://worker')
    })
  })

  it('handles conditional ingress that returns undefined', () => {
    withNamespace('prod', () => {
      expect(cfg.dns('conditional', 'service')).toBe('conditional')
      expect(cfg.dns('conditional', 'ingress')).toBe('conditional.example.com')
      expect(cfg.url('conditional', 'ingress')).toBe('https://conditional.example.com')
    })
  })

  it('respects explicit port in ingress for local development', () => {
    withNamespace('dev', () => {
      expect(cfg.dns('local-service', 'ingress')).toBe('localhost')
      expect(cfg.url('local-service', 'ingress')).toBe('https://localhost:3001')

      // local runtime → localhost:containerPort (no localPort on this app).
      expect(cfg.dns('local-service', 'service')).toBe('localhost')
      expect(cfg.url('local-service', 'service')).toBe('http://localhost:3000')
    })

    withNamespace('prod', () => {
      expect(cfg.dns('local-service', 'ingress')).toBe('example.com')
      expect(cfg.url('local-service', 'ingress')).toBe('https://example.com')

      // kubernetes runtime → servicePort (80) → port omitted.
      expect(cfg.dns('local-service', 'service')).toBe('local-service')
      expect(cfg.url('local-service', 'service')).toBe('http://local-service')
    })
  })

  it('supports dynamic ports via functions', () => {
    withNamespace('dev', () => {
      expect(cfg.dns('dynamic-ports', 'ingress')).toBe('localhost')
      expect(cfg.url('dynamic-ports', 'ingress')).toBe('https://localhost:4000')
    })

    withNamespace('prod', () => {
      expect(cfg.dns('dynamic-ports', 'ingress')).toBe('dynamic.example.com')
      expect(cfg.url('dynamic-ports', 'ingress')).toBe('https://dynamic.example.com')
    })
  })

  it('exposes targetPort/listenPort to get the container port', () => {
    withNamespace('dev', () => {
      expect(cfg.port('dynamic-ports')).toBe(4000)
      expect(cfg.port('api')).toBe(8080)
      expect(cfg.port('web')).toBe(3000)

      expect(cfg.targetPort('api')).toBe(8080)
      expect(cfg.listenPort('api')).toBe(8080)
      expect(cfg.servicePort('api')).toBe(80)
    })

    withNamespace('prod', () => {
      expect(cfg.port('dynamic-ports')).toBe(3000)
    })
  })

  it('throws error when getting port for app without ports config', () => {
    withNamespace('prod', () => {
      expect(() => cfg.port('no-ports-app')).toThrow('no ports configuration found')
    })
  })

  it('supports string port format "service:container"', () => {
    withNamespace('dev', () => {
      // "8080:3000" → servicePort=8080, containerPort=3000.
      expect(cfg.port('string-port-format')).toBe(3000)
      expect(cfg.servicePort('string-port-format')).toBe(8080)
    })

    withNamespace('prod', () => {
      // 80 → servicePort=80, containerPort=80.
      expect(cfg.port('string-port-format')).toBe(80)
      expect(cfg.servicePort('string-port-format')).toBe(80)
    })
  })

  it('service URLs resolve per namespace runtime', () => {
    withNamespace('dev', () => {
      // local runtime → localhost:<containerPort>
      expect(cfg.url('local-service', 'service')).toBe('http://localhost:3000')
      expect(cfg.url('dynamic-ports', 'service')).toBe('http://localhost:4000')
    })

    withNamespace('prod', () => {
      // kubernetes runtime → servicePort. 80 is default for http → omitted.
      expect(cfg.url('local-service', 'service')).toBe('http://local-service')
      expect(cfg.url('dynamic-ports', 'service')).toBe('http://dynamic-ports')
    })
  })

  it('supports named ports via selector option', () => {
    withNamespace('prod', () => {
      expect(cfg.servicePort('metrics')).toBe(80)
      expect(cfg.servicePort('metrics', 'metrics')).toBe(9090)
      expect(cfg.targetPort('metrics', 'metrics')).toBe(9090)
      expect(cfg.url('metrics', 'service', { port: 'metrics' })).toBe('http://metrics:9090')
      expect(cfg.url('metrics', 'cluster', { port: 'metrics' })).toBe(
        'http://metrics.prod.svc.cluster.local:9090'
      )
    })
  })

  it('uses localPort when set in local runtime', () => {
    withNamespace('dev', () => {
      // with-local-port has localPort=3050 → used on localhost.
      expect(cfg.url('with-local-port', 'service')).toBe('http://localhost:3050')
      // targetPort is the container port regardless of runtime.
      expect(cfg.targetPort('with-local-port')).toBe(3000)
    })

    withNamespace('prod', () => {
      // kubernetes runtime ignores localPort.
      expect(cfg.url('with-local-port', 'service')).toBe('http://with-local-port')
    })
  })
})
