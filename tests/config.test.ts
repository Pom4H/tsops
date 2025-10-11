import { defineConfig } from 'tsops'
import { describe, expect, it } from 'vitest'

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

      // test url helper
      expect(cfg.url('api', 'cluster')).toBe('http://api.dev.svc.cluster.local:80')
      expect(cfg.url('api', 'service')).toBe('http://api:80')
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

      // test url helper
      expect(cfg.url('api', 'cluster')).toBe('http://api.prod.svc.cluster.local:80')
      expect(cfg.url('api', 'service')).toBe('http://api:80')
      expect(cfg.url('api', 'ingress')).toBe('https://api.example.com')
    })
  })
})
