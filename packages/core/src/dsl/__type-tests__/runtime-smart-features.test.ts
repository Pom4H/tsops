/**
 * Runtime tests for smart DSL features
 */

import { describe, it, expect } from 'vitest'
import { smart, resolve, fqdn } from '../../index.js'

describe('Runtime: Smart DSL Features', () => {
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

  describe('Port + Protocol shorthand', () => {
    it('should expand port + protocol to listen object', () => {
      const config = smart({
        ...baseConfig,
        services: {
          api: {
            port: 8080,
            protocol: 'http'
          }
        }
      })

      const resolved = resolve(config)
      expect(resolved.services.api.listen).toBeDefined()
      expect(resolved.services.api.listen).toMatchObject({
        kind: 'http',
        protocol: 'http',
        port: 8080
      })
    })

    it('should handle HTTPS protocol', () => {
      const config = smart({
        ...baseConfig,
        services: {
          api: {
            port: 443,
            protocol: 'https'
          }
        }
      })

      const resolved = resolve(config)
      expect(resolved.services.api.listen).toMatchObject({
        kind: 'http',
        protocol: 'https',
        port: 443
      })
    })

    it('should handle TCP protocol', () => {
      const config = smart({
        ...baseConfig,
        services: {
          db: {
            port: 5432,
            protocol: 'tcp'
          }
        }
      })

      const resolved = resolve(config)
      expect(resolved.services.db.listen).toMatchObject({
        kind: 'tcp',
        port: 5432
      })
    })
  })

  describe('Namespace + Subdomain → Host', () => {
    it('should generate host from namespace and subdomain', () => {
      const config = smart({
        ...baseConfig,
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

      const resolved = resolve(config)
      expect(resolved.services.api.public).toBeDefined()
      expect(resolved.services.api.public?.host).toBe('api.example.com')
      expect(resolved.services.api.public?.ns).toBe('prod')
      expect(resolved.services.api.public?.basePath).toBe('/v1')
    })

    it('should default path to / if not specified', () => {
      const config = smart({
        ...baseConfig,
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
      expect(resolved.services.api.public?.basePath).toBe('/')
    })
  })

  describe('Template syntax: @namespace/subdomain', () => {
    it('should parse host template', () => {
      const config = smart({
        ...baseConfig,
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
      expect(resolved.services.api.public?.ns).toBe('prod')
    })

    it('should handle path with template', () => {
      const config = smart({
        ...baseConfig,
        services: {
          api: {
            host: '@prod/api',
            path: '/v2',
            port: 443,
            protocol: 'https'
          }
        }
      })

      const resolved = resolve(config)
      expect(resolved.services.api.public?.basePath).toBe('/v2')
    })
  })

  describe('$ Helper', () => {
    it('should work with $ helper syntax', () => {
      const config = smart({
        ...baseConfig,
        services: $ => ({
          api: {
            host: $('prod', 'api'),
            path: $.path('/v1'),
            port: 443,
            protocol: 'https'
          }
        })
      })

      const resolved = resolve(config)
      expect(resolved.services.api.public?.host).toBe('api.example.com')
      expect(resolved.services.api.public?.basePath).toBe('/v1')
    })

    it('should provide helper utilities', () => {
      const config = smart({
        ...baseConfig,
        services: $ => {
          // Verify helpers exist
          expect(typeof $).toBe('function')
          expect(typeof $.path).toBe('function')
          expect(typeof $.url).toBe('function')
          expect(typeof $.secret).toBe('function')
          expect($.full).toBeDefined()

          return {
            api: { port: 443, protocol: 'https' }
          }
        }
      })

      expect(() => resolve(config)).not.toThrow()
    })
  })

  describe('Mixed syntax', () => {
    it('should handle mix of declarative and helper syntax', () => {
      const config = smart({
        ...baseConfig,
        services: {
          // Declarative
          api: {
            namespace: 'prod',
            subdomain: 'api',
            port: 443,
            protocol: 'https'
          },
          // Template
          web: {
            host: '@prod/www',
            port: 443,
            protocol: 'https'
          }
        }
      })

      const resolved = resolve(config)
      expect(resolved.services.api.public?.host).toBe('api.example.com')
      expect(resolved.services.web.public?.host).toBe('www.example.com')
    })
  })
})
