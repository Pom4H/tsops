import { describe, it, expect } from 'vitest'
import { defineConfig } from 'tsops'

// Create a comprehensive config using most features
const cfg = defineConfig({
  project: 'demo',
  namespaces: {
    dev: { domain: 'dev.example.com', replicas: 1 },
    prod: { domain: 'example.com', replicas: 3 }
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
        ENDPOINT: url('api', 'cluster'),
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
    conditional: {
      // Conditional ingress that might return undefined
      ingress: ({ domain }) => {
        // Simulate conditional logic that might return undefined
        return domain.includes('example.com') ? { domain: `conditional.${domain}` } : undefined as any
      },
      ports: [{ name: 'http', port: 80, targetPort: 6000 }]
    },
    'local-service': {
      // Service with explicit port for local development
      ingress: ({ domain }) => ({ 
        domain,
        port: domain === 'dev.example.com' ? 3001 : undefined
      }),
      ports: [{ name: 'http', port: 80, targetPort: 3000 }]
    },
    'dynamic-ports': {
      // Service with dynamic ports based on namespace
      ingress: ({ domain, namespace }) => ({ 
        domain: `dynamic.${domain}`,
        port: namespace === 'dev' ? 4000 : undefined
      }),
      ports: ({ namespace }) => [{ 
        name: 'http', 
        port: 80, 
        targetPort: namespace === 'dev' ? 4000 : 3000
      }]
    }
  }
})

// Helper to force namespace during tests
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

// Helper to temporarily set process.env keys
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

    // Methods exist
    expect(typeof cfg.env).toBe('function')
    expect(typeof cfg.dns).toBe('function')
    expect(typeof cfg.url).toBe('function')
  })

  it('resolves runtime for dev', () => {
    withNamespace('dev', () => {
      // test dns helper
      expect(cfg.dns('api', 'cluster')).toBe('api.dev.svc.cluster.local')
      expect(cfg.dns('api', 'service')).toBe('api')
      expect(cfg.dns('api', 'ingress')).toBe('api.dev.example.com')
      
      // test url helper - protocol automatically resolved from ingress config
      expect(cfg.url('api', 'cluster')).toBe('http://api.dev.svc.cluster.local')
      expect(cfg.url('api', 'service')).toBe('http://api')
      expect(cfg.url('api', 'ingress')).toBe('https://api.dev.example.com')

      // test env helper returns values from process.env
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

  it('resolves runtime for prod', () => {
    withNamespace('prod', () => {
      // test dns helper
      expect(cfg.dns('api', 'cluster')).toBe('api.prod.svc.cluster.local')
      expect(cfg.dns('api', 'service')).toBe('api')
      expect(cfg.dns('api', 'ingress')).toBe('api.example.com')
      
      // test url helper - protocol automatically resolved from ingress config
      expect(cfg.url('api', 'cluster')).toBe('http://api.prod.svc.cluster.local')
      expect(cfg.url('api', 'service')).toBe('http://api')
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
      // admin app still uses http in dev (explicit protocol overrides auto-detection)
      expect(cfg.dns('admin', 'ingress')).toBe('admin.dev.example.com')
      expect(cfg.url('admin', 'ingress')).toBe('http://admin.dev.example.com')
    })
  })

  it('handles apps without ingress gracefully', () => {
    withNamespace('prod', () => {
      // worker has no ingress, should throw when trying to access ingress DNS/URL
      expect(() => cfg.dns('worker', 'ingress')).toThrow()
      expect(() => cfg.url('worker', 'ingress')).toThrow()
      
      // but cluster and service DNS should work fine
      expect(cfg.dns('worker', 'cluster')).toBe('worker.prod.svc.cluster.local')
      expect(cfg.dns('worker', 'service')).toBe('worker')
      expect(cfg.url('worker', 'service')).toBe('http://worker')
    })
  })

  it('handles conditional ingress that returns undefined', () => {
    withNamespace('prod', () => {
      // conditional app returns ingress object for example.com domain
      expect(cfg.dns('conditional', 'cluster')).toBe('conditional.prod.svc.cluster.local')
      expect(cfg.dns('conditional', 'service')).toBe('conditional')
      // ingress should work because domain includes 'example.com'
      expect(cfg.dns('conditional', 'ingress')).toBe('conditional.example.com')
      expect(cfg.url('conditional', 'ingress')).toBe('https://conditional.example.com')
    })
  })

  it('respects explicit port in ingress for local development', () => {
    withNamespace('dev', () => {
      // local-service has explicit port 3001 for dev environment
      expect(cfg.dns('local-service', 'ingress')).toBe('dev.example.com')
      expect(cfg.url('local-service', 'ingress')).toBe('https://dev.example.com:3001')
      
      // cluster and service types should not have ports
      expect(cfg.url('local-service', 'cluster')).toBe('http://local-service.dev.svc.cluster.local')
      expect(cfg.url('local-service', 'service')).toBe('http://local-service')
    })

    withNamespace('prod', () => {
      // local-service has no port in production (undefined)
      expect(cfg.dns('local-service', 'ingress')).toBe('example.com')
      expect(cfg.url('local-service', 'ingress')).toBe('https://example.com')
    })
  })

  it('supports dynamic ports via functions', () => {
    withNamespace('dev', () => {
      // dynamic-ports uses function to set different targetPorts per namespace
      expect(cfg.dns('dynamic-ports', 'ingress')).toBe('dynamic.dev.example.com')
      expect(cfg.url('dynamic-ports', 'ingress')).toBe('https://dynamic.dev.example.com:4000')
    })

    withNamespace('prod', () => {
      // dynamic-ports uses different port in production
      expect(cfg.dns('dynamic-ports', 'ingress')).toBe('dynamic.example.com')
      expect(cfg.url('dynamic-ports', 'ingress')).toBe('https://dynamic.example.com')
    })
  })
})
