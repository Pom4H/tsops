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
      ingress: ({ domain }) => `api.${domain}`,
      ports: [{ name: 'http', port: 80, targetPort: 8080 }]
    },
    web: {
      ingress: ({ domain }) => `web.${domain}`,
      // envFrom: entire configMap
      env: ({ configMap }) => configMap('namespace-flags'),
      ports: [{ name: 'http', port: 80, targetPort: 3000 }]
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
      
      // test url helper
      expect(cfg.url('api', 'cluster')).toBe('http://api.dev.svc.cluster.local:80')
      expect(cfg.url('api', 'service')).toBe('http://api:80')
      expect(cfg.url('api', 'ingress')).toBe('https://api.dev.example.com')
      
      // test env helper
      expect(cfg.env('api', 'ENDPOINT')).toBe('http://api.dev.svc.cluster.local:80')
      expect(cfg.env('api', 'HOST')).toBe('api.dev.example.com')
      expect(cfg.env('api', 'NODE_ENV')).toBe('production')
      expect(cfg.env('api', 'SHARED_KEY')).toBe('secret:shared-secrets:SHARED_KEY')
      expect(cfg.env('api', 'TOKEN')).toBe('secret:token-secrets:PROJECT')
      expect(cfg.env('api', 'LOG_LEVEL')).toBe('configmap:app-settings:LOG_LEVEL')
      expect(cfg.env('api', 'NAMESPACE')).toBe('configmap:namespace-flags:NAMESPACE')
      expect(cfg.env('api', 'PROJECT')).toBe('demo')
    })
  })

  it('resolves runtime for prod', () => {
    withNamespace('prod', () => {
      // test dns helper
      expect(cfg.dns('api', 'cluster')).toBe('api.prod.svc.cluster.local')
      expect(cfg.dns('api', 'service')).toBe('api')
      expect(cfg.dns('api', 'ingress')).toBe('api.example.com')
      
      // test url helper
      expect(cfg.url('api', 'cluster')).toBe('http://api.prod.svc.cluster.local:80')
      expect(cfg.url('api', 'service')).toBe('http://api:80')
      expect(cfg.url('api', 'ingress')).toBe('https://api.example.com')
    })
  })
})
