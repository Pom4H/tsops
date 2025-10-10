/**
 * Runtime tests for host resolution from namespace + subdomain
 */

import { describe, it, expect } from 'vitest'
import { smart, resolve, fqdn } from '../../index.js'

describe('Runtime: Host Resolution', () => {
  it('should resolve host from namespace + subdomain', () => {
    const config = smart({
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
          port: 443,
          protocol: 'https'
        }
      }
    })

    const resolved = resolve(config)
    expect(resolved.services.api.public?.host).toBe('api.example.com')
  })

  it('should resolve host from template syntax', () => {
    const config = smart({
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
          host: '@prod/api',
          port: 443,
          protocol: 'https'
        }
      }
    })

    const resolved = resolve(config)
    expect(resolved.services.api.public?.host).toBe('api.example.com')
  })

  it('should resolve hosts for multiple regions', () => {
    const config = smart({
      project: 'test',
      regions: {
        us: fqdn('example.com'),
        eu: fqdn('example.eu')
      },
      namespaces: {
        'us-prod': { region: 'us' },
        'eu-prod': { region: 'eu' }
      },
      clusters: {
        k8s: {
          apiServer: 'https://k8s.internal:6443' as const,
          context: 'k8s',
          namespaces: ['us-prod', 'eu-prod'] as const
        }
      },
      services: {
        'us-api': {
          namespace: 'us-prod',
          subdomain: 'api',
          port: 443,
          protocol: 'https'
        },
        'eu-api': {
          namespace: 'eu-prod',
          subdomain: 'api',
          port: 443,
          protocol: 'https'
        }
      }
    })

    const resolved = resolve(config)
    expect(resolved.services['us-api'].public?.host).toBe('api.example.com')
    expect(resolved.services['eu-api'].public?.host).toBe('api.example.eu')
  })

  it('should throw for unknown namespace', () => {
    const config = smart({
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
          namespace: 'staging' as any,
          subdomain: 'api',
          port: 443,
          protocol: 'https'
        }
      }
    })

    expect(() => resolve(config)).toThrow(/unknown namespace/i)
  })

  it('should use $ helper for host generation', () => {
    const config = smart({
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
      services: $ => ({
        api: {
          host: $('prod', 'api'),
          port: 443,
          protocol: 'https'
        }
      })
    })

    const resolved = resolve(config)
    expect(resolved.services.api.public?.host).toBe('api.example.com')
  })
})
