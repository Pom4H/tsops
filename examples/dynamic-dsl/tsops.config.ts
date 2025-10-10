/**
 * Example: Dynamic Infrastructure DSL
 * 
 * This example demonstrates the type-safe infrastructure DSL with:
 * - Branded types (FQDN, Path, Port, Url)
 * - Type-level invariants (no cycles, distinct hosts, TLS policies)
 * - Dynamic sections with typed helpers
 * - Compile-time validation
 */

import { defineDSL, fqdn, port, path, resolveDSL, getExternalEndpoint, getInternalEndpoint } from '@tsops/core'

const config = defineDSL({
  project: 'worken',

  // ============================================================================
  // FACTS - Primary data from which everything else derives
  // ============================================================================

  regions: {
    ai: fqdn('worken.ai'),
    ru: fqdn('worken.ru')
  },

  namespaces: {
    'ai-prod': { region: 'ai' },
    'ai-stage': { region: 'ai' },
    'ru-prod': { region: 'ru' },
    'ru-stage': { region: 'ru' }
  },

  clusters: {
    'docker-desktop': {
      apiServer: 'https://kubernetes.docker.internal:6443',
      context: 'docker-desktop',
      namespaces: ['ai-stage', 'ru-stage'] as const
    },
    'k8s-prod': {
      apiServer: 'https://k8s-prod.internal:6443',
      context: 'k8s-prod',
      namespaces: ['ai-prod', 'ru-prod'] as const
    }
  },

  // ============================================================================
  // DYNAMIC SECTIONS - Use typed helpers from facts
  // ============================================================================

  /**
   * Services configuration with dependency validation.
   * The noCycles validator ensures no circular dependencies.
   */
  services: (h) =>
    h.validate.noCycles({
      // Public API service
      api: {
        description: 'REST API backend',
        expose: 'public',
        listen: {
          kind: 'http',
          protocol: 'https',
          port: port(443)
        },
        needs: ['db', 'cache'] as const,
        public: {
          ns: 'ai-prod',
          host: h.hostFor('ai-prod', 'api'),
          basePath: h.path('/v1')
        }
      },

      // Public web application
      web: {
        description: 'Frontend application',
        expose: 'public',
        listen: {
          kind: 'http',
          protocol: 'https',
          port: port(443)
        },
        needs: ['api'] as const,
        public: {
          ns: 'ai-prod',
          host: h.hostFor('ai-prod', 'app'),
          basePath: h.path('/')
        }
      },

      // Internal database
      db: {
        description: 'PostgreSQL database',
        expose: 'cluster',
        listen: {
          kind: 'tcp',
          port: port(5432)
        }
      },

      // Internal cache
      cache: {
        description: 'Redis cache',
        expose: 'cluster',
        listen: {
          kind: 'tcp',
          port: port(6379)
        }
      },

      // Worker service (multiple ports)
      worker: {
        description: 'Background job worker',
        expose: 'cluster',
        listen: [
          { kind: 'tcp', port: port(8080) },
          { kind: 'tcp', port: port(9090) }
        ]
      }
    }),

  /**
   * Environment variables with validation.
   * Required vars must have secretRef in production.
   */
  env: (h) => {
    const base = {
      // Required runtime vars (must have secretRef)
      ...h.env.require('DATABASE_URL', {
        scope: 'runtime',
        kind: 'url',
        secretRef: h.secretRef('db', 'url')
      }),
      ...h.env.require('REDIS_URL', {
        scope: 'runtime',
        kind: 'url',
        secretRef: h.secretRef('cache', 'url')
      }),
      ...h.env.require('JWT_SECRET', {
        scope: 'runtime',
        kind: 'raw',
        secretRef: h.secretRef('api', 'jwt')
      }),

      // Optional vars with dev defaults
      ...h.env.optional('LOG_LEVEL', {
        scope: 'runtime',
        kind: 'raw',
        devDefault: 'info'
      }),
      ...h.env.optional('ENABLE_METRICS', {
        scope: 'runtime',
        kind: 'bool',
        devDefault: 'false'
      })
    }

    // Auto-generate NEXT_PUBLIC_* vars for public services
    const publicVars = h.env.nextPublicFor({
      api: { public: { host: 'api.worken.ai', basePath: '/v1' as any } },
      web: { public: { host: 'app.worken.ai', basePath: '/' as any } }
    })

    return { ...base, ...publicVars }
  },

  /**
   * Ingress rules with TLS validation.
   * letsencrypt policy cannot have secretName (auto-generated).
   */
  ingress: (h) =>
    h.validate.ingress([
      {
        ns: 'ai-prod',
        host: h.hostFor('ai-prod', 'api'),
        tls: {
          policy: 'letsencrypt'
          // secretName not allowed with letsencrypt!
        },
        paths: [h.path('/'), h.path('/v1'), h.path('/health')]
      },
      {
        ns: 'ai-prod',
        host: h.hostFor('ai-prod', 'app'),
        tls: {
          policy: 'letsencrypt'
        },
        paths: [h.path('/')]
      },
      {
        ns: 'ru-prod',
        host: h.hostFor('ru-prod', 'api'),
        tls: {
          policy: 'custom',
          secretName: 'ru-tls-cert'
        },
        paths: [h.path('/'), h.path('/v1')]
      }
    ]),

  /**
   * Images configuration (optional).
   */
  images: (h) => ({
    api: {
      repo: 'ghcr.io/worken/api',
      tag: 'latest'
    },
    web: {
      repo: 'ghcr.io/worken/web',
      tag: 'latest'
    },
    worker: {
      repo: 'ghcr.io/worken/worker',
      tag: 'v1.0.0'
    }
  })
})

// ============================================================================
// Runtime Usage
// ============================================================================

// Resolve all dynamic sections
const resolved = resolveDSL(config)

console.log('=== Resolved Configuration ===\n')
console.log('Project:', resolved.project)
console.log('Regions:', Object.keys(resolved.regions))
console.log('Namespaces:', Object.keys(resolved.namespaces))
console.log('Clusters:', Object.keys(resolved.clusters))
console.log('Services:', Object.keys(resolved.services))

console.log('\n=== Service Endpoints ===\n')

// Get external endpoints for public services
const apiUrl = getExternalEndpoint(resolved, 'api')
const webUrl = getExternalEndpoint(resolved, 'web')
const dbInternal = getInternalEndpoint(resolved, 'db', 'ai-prod')
const cacheInternal = getInternalEndpoint(resolved, 'cache', 'ai-prod')

console.log('API (external):', apiUrl)
console.log('Web (external):', webUrl)
console.log('DB (internal):', dbInternal)
console.log('Cache (internal):', cacheInternal)

console.log('\n=== Environment Variables ===\n')

if (resolved.env) {
  for (const [key, rule] of Object.entries(resolved.env)) {
    console.log(
      `${key}: ${rule.required ? 'required' : 'optional'} (${rule.scope})${
        rule.secretRef ? ` -> ${rule.secretRef}` : ''
      }`
    )
  }
}

console.log('\n=== Ingress Rules ===\n')

if (resolved.ingress) {
  for (const rule of resolved.ingress) {
    console.log(
      `${rule.host} (${rule.ns}) - TLS: ${rule.tls.policy}${
        rule.tls.secretName ? ` (${rule.tls.secretName})` : ''
      }`
    )
    console.log(`  Paths: ${rule.paths.join(', ')}`)
  }
}

// Export for use as tsops config (compatible with existing system)
export default config
