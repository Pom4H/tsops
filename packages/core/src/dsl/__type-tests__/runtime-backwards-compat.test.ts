/**
 * Runtime tests for backwards compatibility
 * Ensures both original and smart APIs work correctly
 */

import { describe, it, expect } from 'vitest'
import { defineDSL, smart, resolveDSL, resolve, fqdn, port } from '../../index.js'

describe('Runtime: Backwards Compatibility', () => {
  it('should work with original defineDSL API', () => {
    const config = defineDSL({
      project: 'test-old',
      regions: { us: fqdn('example.com') },
      namespaces: { prod: { region: 'us' } },
      clusters: {
        k8s: {
          apiServer: 'https://k8s.internal:6443' as const,
          context: 'k8s',
          namespaces: ['prod'] as const
        }
      },
      services: (h) => ({
        api: {
          expose: 'public',
          listen: { kind: 'http', protocol: 'https', port: port(443) },
          public: {
            ns: 'prod',
            host: h.hostFor('prod', 'api'),
            basePath: h.path('/')
          }
        }
      })
    })

    const resolved = resolveDSL(config)
    expect(resolved.services.api).toBeDefined()
    expect(resolved.services.api.public?.host).toBe('api.example.com')
  })

  it('should work with new smart API', () => {
    const config = smart({
      project: 'test-new',
      regions: { us: fqdn('example.com') },
      namespaces: { prod: { region: 'us' } },
      clusters: {
        k8s: {
          apiServer: 'https://k8s.internal:6443' as const,
          context: 'k8s',
          namespaces: ['prod'] as const
        }
      },
      services: {
        api: {
          namespace: 'prod',
          subdomain: 'api',
          port: 443,
          protocol: 'https'
        }
      }
    })

    const resolved = resolve(config)
    expect(resolved.services.api).toBeDefined()
    expect(resolved.services.api.public?.host).toBe('api.example.com')
  })

  it('should produce same result for equivalent configs', () => {
    // Old API
    const oldConfig = defineDSL({
      project: 'test',
      regions: { us: fqdn('example.com') },
      namespaces: { prod: { region: 'us' } },
      clusters: {
        k8s: {
          apiServer: 'https://k8s.internal:6443' as const,
          context: 'k8s',
          namespaces: ['prod'] as const
        }
      },
      services: (h) => ({
        api: {
          expose: 'public',
          listen: { kind: 'http', protocol: 'https', port: port(443) },
          public: {
            ns: 'prod',
            host: h.hostFor('prod', 'api'),
            basePath: h.path('/v1')
          }
        }
      })
    })

    // New API
    const newConfig = smart({
      project: 'test',
      regions: { us: fqdn('example.com') },
      namespaces: { prod: { region: 'us' } },
      clusters: {
        k8s: {
          apiServer: 'https://k8s.internal:6443' as const,
          context: 'k8s',
          namespaces: ['prod'] as const
        }
      },
      services: {
        api: {
          namespace: 'prod',
          subdomain: 'api',
          path: '/v1',
          port: 443,
          protocol: 'https'
        }
      }
    })

    const oldResolved = resolveDSL(oldConfig)
    const newResolved = resolve(newConfig)

    // Both should produce same host
    expect(oldResolved.services.api.public?.host).toBe('api.example.com')
    expect(newResolved.services.api.public?.host).toBe('api.example.com')
    
    // Both should have same basePath
    expect(oldResolved.services.api.public?.basePath).toBe('/v1')
    expect(newResolved.services.api.public?.basePath).toBe('/v1')
  })
})
