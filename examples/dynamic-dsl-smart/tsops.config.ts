/**
 * Example: Smart Dynamic DSL - Improved DX
 * 
 * Demonstrates the improved API with:
 * - Declarative services (no function wrappers)
 * - Automatic validation (no explicit h.validate calls)
 * - Smart host resolution (namespace + subdomain)
 * - Template syntax (@namespace/subdomain)
 * - Short $ helper for concise operations
 */

import { smart, resolve, fqdn } from '@tsops/core'

// ============================================================================
// Style 1: Declarative (Recommended)
// ============================================================================

const config = smart({
  project: 'worken',

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
  // Services - Declarative, no helpers needed!
  // ============================================================================

  services: {
    // Public API - auto-generates host from namespace + subdomain
    api: {
      description: 'REST API backend',
      namespace: 'ai-prod',
      subdomain: 'api',
      path: '/v1',
      port: 443,
      protocol: 'https',
      needs: ['db', 'cache']  // Auto-validated for cycles!
    },

    // Public web app
    web: {
      description: 'Frontend application',
      namespace: 'ai-prod',
      subdomain: 'app',
      path: '/',
      port: 443,
      protocol: 'https',
      needs: ['api']
    },

    // Internal services - no namespace/subdomain needed
    db: {
      description: 'PostgreSQL database',
      expose: 'cluster',
      port: 5432,
      protocol: 'tcp'
    },

    cache: {
      description: 'Redis cache',
      expose: 'cluster',
      port: 6379,
      protocol: 'tcp'
    },

    worker: {
      description: 'Background job worker',
      expose: 'cluster',
      port: 8080,
      protocol: 'tcp'
    }
  },

  // ============================================================================
  // Environment - Simple object syntax
  // ============================================================================

  env: {
    DATABASE_URL: {
      required: true,
      scope: 'runtime',
      kind: 'url',
      secretRef: 'secret://db/url' as any
    },
    REDIS_URL: {
      required: true,
      scope: 'runtime',
      kind: 'url',
      secretRef: 'secret://cache/url' as any
    },
    LOG_LEVEL: {
      required: false,
      scope: 'runtime',
      kind: 'raw',
      devDefault: 'info'
    }
  },

  // ============================================================================
  // Ingress - Simple array syntax
  // ============================================================================

  ingress: [
    {
      ns: 'ai-prod',
      host: 'api.worken.ai',
      tls: { policy: 'letsencrypt' },
      paths: ['/', '/v1', '/health'] as any[]
    },
    {
      ns: 'ai-prod',
      host: 'app.worken.ai',
      tls: { policy: 'letsencrypt' },
      paths: ['/'] as any[]
    }
  ]
})

// ============================================================================
// Style 2: With $ helper (for complex cases)
// ============================================================================

const configWithHelper = smart({
  project: 'worken',

  regions: {
    ai: fqdn('worken.ai'),
    ru: fqdn('worken.ru')
  },

  namespaces: {
    'ai-prod': { region: 'ai' }
  },

  clusters: {
    'k8s-prod': {
      apiServer: 'https://k8s-prod.internal:6443',
      context: 'k8s-prod',
      namespaces: ['ai-prod'] as const
    }
  },

  // Using $ for concise syntax
  services: $ => ({
    api: {
      host: $('ai-prod', 'api'),  // Generates host
      path: $.path('/v1'),
      port: 443,
      protocol: 'https',
      needs: ['db']
    },
    db: {
      port: 5432,
      protocol: 'tcp'
    }
  }),

  // $ helper for env
  env: $ => ({
    DATABASE_URL: $.secret('db', 'url') as any,
    API_URL: $.url('https', $('ai-prod', 'api'), '/v1')
  })
})

// ============================================================================
// Style 3: Template syntax
// ============================================================================

const configWithTemplates = smart({
  project: 'worken',

  regions: {
    ai: fqdn('worken.ai')
  },

  namespaces: {
    'ai-prod': { region: 'ai' }
  },

  clusters: {
    'k8s': {
      apiServer: 'https://k8s.internal:6443',
      context: 'k8s',
      namespaces: ['ai-prod'] as const
    }
  },

  // Template syntax: '@namespace/subdomain'
  services: {
    api: {
      host: '@ai-prod/api',  // Automatically parsed!
      path: '/v1',
      port: 443,
      protocol: 'https'
    },
    web: {
      host: '@ai-prod/app',
      path: '/',
      port: 443,
      protocol: 'https'
    }
  }
})

// ============================================================================
// Runtime Usage
// ============================================================================

const resolved = resolve(config)

console.log('=== Smart DSL - Improved DX ===\n')
console.log('Project:', resolved.project)
console.log('Services:', Object.keys(resolved.services))

console.log('\n=== Auto-Generated Hosts ===\n')
console.log('API:', resolved.services.api.public?.host)  // api.worken.ai
console.log('Web:', resolved.services.web.public?.host)  // app.worken.ai

console.log('\n=== Environment Variables ===\n')
if (resolved.env) {
  for (const [key, rule] of Object.entries(resolved.env)) {
    console.log(
      `${key}: ${rule.required ? 'required' : 'optional'} (${rule.scope})`
    )
  }
}

console.log('\n=== Comparison ===')
console.log('OLD: services: (h) => h.validate.noCycles({ ... })')
console.log('NEW: services: { ... }')
console.log('\nValidation happens automatically! ✨')

export default config
