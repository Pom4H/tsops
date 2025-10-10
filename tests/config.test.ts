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
      network: ({ domain }) => `api.${domain}`,
      ports: [{ name: 'http', port: 80, targetPort: 8080 }]
    },
    web: {
      network: ({ domain }) => `web.${domain}`,
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
    expect(typeof cfg.getRuntime).toBe('function')
  })

  it('resolves runtime for dev', () => {
    withNamespace('dev', () => {
      const runtime = cfg.getRuntime()
      expect(runtime.namespace).toBe('dev')
      expect(runtime.project).toBe('demo')
      
      // test dns helper
      expect(runtime.dns('api', 'cluster')).toBe('api.dev.svc.cluster.local')
      expect(runtime.dns('api', 'service')).toBe('api')
      expect(runtime.dns('api', 'ingress')).toBe('api.dev.example.com')
      
      // test url helper
      expect(runtime.url('api', 'cluster')).toBe('http://api.dev.svc.cluster.local:80')
      expect(runtime.url('api', 'service')).toBe('http://api:80')
      expect(runtime.url('api', 'ingress')).toBe('http://api.dev.example.com:80')
      
      // test env helper
      const runtimeEnv = runtime.getEnv('api')
      expect(runtimeEnv.ENDPOINT).toBe('http://api.dev.svc.cluster.local:80')
      expect(runtimeEnv.HOST).toBe('api.dev.example.com')
      expect(runtimeEnv.NODE_ENV).toBe('production')
      expect(runtimeEnv.SHARED_KEY).toBe('secret:shared-secrets:SHARED_KEY')
      expect(runtimeEnv.TOKEN).toBe('secret:token-secrets:PROJECT')
      expect(runtimeEnv.LOG_LEVEL).toBe('configmap:app-settings:LOG_LEVEL')
      expect(runtimeEnv.NAMESPACE).toBe('configmap:namespace-flags:NAMESPACE')
      expect(runtimeEnv.PROJECT).toBe('demo')
    })
  })

  it('resolves runtime for prod', () => {
    withNamespace('prod', () => {
      const runtime = cfg.getRuntime()
      expect(runtime.namespace).toBe('prod')
      expect(runtime.project).toBe('demo')
      
      // test dns helper
      expect(runtime.dns('api', 'cluster')).toBe('api.prod.svc.cluster.local')
      expect(runtime.dns('api', 'service')).toBe('api')
      expect(runtime.dns('api', 'ingress')).toBe('api.example.com')
      
      // test url helper
      expect(runtime.url('api', 'cluster')).toBe('http://api.prod.svc.cluster.local:80')
      expect(runtime.url('api', 'service')).toBe('http://api:80')
      expect(runtime.url('api', 'ingress')).toBe('http://api.example.com:80')
    })
  })
})
