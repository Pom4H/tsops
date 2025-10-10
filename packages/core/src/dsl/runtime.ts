/**
 * Runtime implementation of DSL helpers.
 * Provides actual function implementations for the type-safe builder API.
 * 
 * @module dsl/runtime
 */

import type { Core, Services, RegionOf, DomainForNamespace } from './core.js'
import type { Helpers } from './helpers.js'
import type { IngressRule, EnvRule, EnvSpec } from './validators.js'
import {
  path as createPath,
  url as createUrl,
  host as createHost,
  secretRef as createSecretRef,
  type Path,
  type Url,
  type HttpProtocol,
  type SecretRefString,
  type Host
} from './brands.js'

/**
 * Create runtime helpers instance from core configuration.
 * These helpers are passed to dynamic config sections.
 */
export function createHelpers<C extends Core>(config: C): Helpers<C> {
  return {
    // Facts
    project: config.project,
    regions: config.regions,
    namespaces: config.namespaces,
    clusters: config.clusters,

    // Domain builders
    hostFor: (ns, sub) => {
      const namespace = config.namespaces[ns]
      if (!namespace) {
        throw new Error(`Unknown namespace: ${ns}`)
      }
      const region = namespace.region
      const domain = config.regions[region]
      if (!domain) {
        throw new Error(`Unknown region: ${region} for namespace ${ns}`)
      }
      return createHost(`${sub}.${domain}`) as any
    },

    path: (p) => {
      return createPath(p)
    },

    url: (proto, hostname, pathname) => {
      return createUrl(proto, hostname, pathname) as any
    },

    // Environment helpers
    env: {
      require: (key, rule) => {
        return {
          [key]: {
            required: true,
            ...rule
          }
        } as any
      },

      optional: (key, rule) => {
        return {
          [key]: {
            required: false,
            ...rule
          }
        } as any
      },

      nextPublicFor: (services) => {
        const result: Record<string, EnvRule<true>> = {}

        for (const [serviceName, service] of Object.entries(services)) {
          if (service.public) {
            const varName = `NEXT_PUBLIC_${serviceName.toUpperCase()}_URL`
            result[varName] = {
              required: true,
              scope: 'runtime',
              kind: 'url'
            } as EnvRule<true>
          }
        }

        return result as any
      }
    },

    secretRef: (namespace, key) => {
      return createSecretRef(namespace, key)
    },

    // Validators
    validate: {
      noCycles: (services) => {
        // Runtime cycle detection using DFS
        const visited = new Set<string>()
        const recursionStack = new Set<string>()

        function hasCycle(serviceName: string): boolean {
          if (recursionStack.has(serviceName)) {
            return true // Cycle detected
          }
          if (visited.has(serviceName)) {
            return false // Already processed
          }

          visited.add(serviceName)
          recursionStack.add(serviceName)

          const service = services[serviceName]
          if (service?.needs) {
            for (const dep of service.needs) {
              if (hasCycle(dep as string)) {
                throw new Error(
                  `Dependency cycle detected: ${serviceName} -> ${dep} (already in path)`
                )
              }
            }
          }

          recursionStack.delete(serviceName)
          return false
        }

        for (const serviceName of Object.keys(services)) {
          if (!visited.has(serviceName)) {
            if (hasCycle(serviceName)) {
              throw new Error(`Cycle detected in services graph`)
            }
          }
        }

        return services as any
      },

      distinctHosts: (targets) => {
        const allHosts = new Set<string>()
        const duplicates: string[] = []

        for (const [ns, hosts] of Object.entries(targets)) {
          for (const [service, host] of Object.entries(hosts)) {
            if (allHosts.has(host)) {
              duplicates.push(`${host} (in ${ns}.${service})`)
            }
            allHosts.add(host)
          }
        }

        if (duplicates.length > 0) {
          throw new Error(`Duplicate hosts found: ${duplicates.join(', ')}`)
        }

        return targets as any
      },

      ingress: (rules) => {
        for (const rule of rules) {
          if (rule.tls.policy === 'letsencrypt' && rule.tls.secretName) {
            throw new Error(
              `Ingress rule for ${rule.host}: letsencrypt policy cannot have secretName (it's auto-generated)`
            )
          }
          if (rule.tls.policy === 'custom' && !rule.tls.secretName) {
            console.warn(
              `Ingress rule for ${rule.host}: custom TLS policy should have secretName`
            )
          }
        }
        return rules as any
      }
    }
  }
}

/**
 * Runtime validation utilities.
 */
export const runtimeValidate = {
  /**
   * Validate environment spec has required secretRefs in production.
   */
  requireSecretsInProd(env: EnvSpec, isProd: boolean): void {
    if (!isProd) return

    const missing: string[] = []

    for (const [key, rule] of Object.entries(env)) {
      if (rule.required && !rule.secretRef) {
        missing.push(key)
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `Production environment requires secretRef for: ${missing.join(', ')}`
      )
    }
  },

  /**
   * Validate all paths start with /.
   */
  validatePaths(paths: readonly Path[]): void {
    for (const p of paths) {
      if (!p.startsWith('/')) {
        throw new Error(`Path must start with /: ${p}`)
      }
    }
  }
}
