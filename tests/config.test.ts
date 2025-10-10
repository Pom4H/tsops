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
      env: ({ secret, configMap, dns, project, domain }) => ({
        NODE_ENV: 'production',
        TOKEN: secret('token-secrets', 'PROJECT'),
        SHARED_KEY: secret('shared-secrets', 'SHARED_KEY'),
        LOG_LEVEL: configMap('app-settings', 'LOG_LEVEL'),
        NAMESPACE: configMap('namespace-flags', 'NAMESPACE'),
        ENDPOINT: dns('api', 'cluster'),
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
    expect(typeof cfg.getApp).toBe('function')
    expect(typeof cfg.getEnv).toBe('function')
    expect(typeof cfg.getInternalEndpoint).toBe('function')
    expect(typeof cfg.getExternalEndpoint).toBe('function')
    expect(typeof cfg.getNamespace).toBe('function')
  })

  it('resolves runtime for dev', () => {
    withNamespace('dev', () => {
      // getNamespace
      expect(cfg.getNamespace()).toBe('dev')

      // getApp
      const api = cfg.getApp('api')
      expect(api.serviceName).toBe('api')
      expect(api.internalEndpoint).toBe('http://api:8080')
      expect(api.image).toMatch(/^ghcr\.io\/acme\/api:/)

      // env resolution
      expect(api.env.NODE_ENV).toBe('production')
      expect(api.env.SHARED_KEY).toBe('shared')
      expect(api.env.TOKEN).toBe('demo') // from token-secrets.PROJECT => project
      expect(api.env.LOG_LEVEL).toBe('info')
      expect(api.env.NAMESPACE).toBe('dev')
      expect(api.env.PROJECT).toBe('demo')
      expect(api.env.ENDPOINT).toBe('api.dev.svc.cluster.local')
      expect(api.env.HOST).toBe('api.dev.example.com')

      // getEnv
      const env = cfg.getEnv('api')
      expect(env).toMatchObject(api.env)

      // internal endpoint helper
      expect(cfg.getInternalEndpoint('api')).toBe(api.internalEndpoint)

      // external endpoint for api comes from network host
      expect(cfg.getExternalEndpoint('api')).toBe('https://api.dev.example.com')

      // web app
      const web = cfg.getApp('web')
      expect(web.serviceName).toBe('web')
      expect(web.env.NAMESPACE).toBe('dev')
      expect(cfg.getExternalEndpoint('web')).toBe('https://web.dev.example.com')
    })
  })

  it('resolves runtime for prod', () => {
    withNamespace('prod', () => {
      expect(cfg.getNamespace()).toBe('prod')

      const api = cfg.getApp('api')
      expect(api.serviceName).toBe('api')
      expect(api.internalEndpoint).toBe('http://api:8080')
      expect(cfg.getExternalEndpoint('api')).toBe('https://api.example.com')
      
      const web = cfg.getApp('web')
      expect(web.serviceName).toBe('web')
      expect(cfg.getExternalEndpoint('web')).toBe('https://web.example.com')
    })
  })
})
