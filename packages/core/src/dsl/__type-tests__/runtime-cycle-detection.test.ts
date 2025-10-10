/**
 * Runtime tests for cycle detection in service dependencies
 */

import { describe, it, expect } from 'vitest'
import { smart, resolve, fqdn } from '../../index.js'

describe('Runtime: Cycle Detection', () => {
  const baseConfig = {
    project: 'test',
    regions: { us: fqdn('example.com') },
    namespaces: { prod: { region: 'us' } },
    clusters: {
      k8s: {
        apiServer: 'https://k8s.internal:6443' as const,
        context: 'k8s',
        namespaces: ['prod'] as const
      }
    }
  }

  it('should accept acyclic dependency graph', () => {
    const config = smart({
      ...baseConfig,
      services: {
        api: { port: 8080, protocol: 'http', needs: ['db'] },
        db: { port: 5432, protocol: 'tcp' }
      }
    })

    expect(() => resolve(config)).not.toThrow()
  })

  it('should detect direct cycle (a -> b -> a)', () => {
    const config = smart({
      ...baseConfig,
      services: {
        a: { port: 8080, protocol: 'http', needs: ['b'] },
        b: { port: 8081, protocol: 'http', needs: ['a'] }
      }
    })

    expect(() => resolve(config)).toThrow(/cycle/i)
  })

  it('should detect indirect cycle (a -> b -> c -> a)', () => {
    const config = smart({
      ...baseConfig,
      services: {
        a: { port: 8080, protocol: 'http', needs: ['b'] },
        b: { port: 8081, protocol: 'http', needs: ['c'] },
        c: { port: 8082, protocol: 'http', needs: ['a'] }
      }
    })

    expect(() => resolve(config)).toThrow(/cycle/i)
  })

  it('should handle complex acyclic graph', () => {
    const config = smart({
      ...baseConfig,
      services: {
        web: { port: 443, protocol: 'https', needs: ['api'] },
        api: { port: 8080, protocol: 'http', needs: ['db', 'cache'] },
        worker: { port: 8081, protocol: 'http', needs: ['db', 'queue'] },
        db: { port: 5432, protocol: 'tcp' },
        cache: { port: 6379, protocol: 'tcp' },
        queue: { port: 6380, protocol: 'tcp' }
      }
    })

    expect(() => resolve(config)).not.toThrow()
    const resolved = resolve(config)
    expect(Object.keys(resolved.services)).toHaveLength(6)
  })

  it('should handle services with no dependencies', () => {
    const config = smart({
      ...baseConfig,
      services: {
        api: { port: 8080, protocol: 'http' },
        db: { port: 5432, protocol: 'tcp' }
      }
    })

    expect(() => resolve(config)).not.toThrow()
  })
})
