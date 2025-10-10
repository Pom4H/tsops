/**
 * Valid: Original defineDSL API still works
 * Should compile using original verbose syntax
 */

import { defineDSL, fqdn, port, path, resolveDSL } from '../../index.js'

const config = defineDSL({
  project: 'test',
  
  regions: {
    us: fqdn('example.com')
  },
  
  namespaces: {
    prod: { region: 'us' }
  },
  
  clusters: {
    k8s: {
      apiServer: 'https://k8s.internal:6443',
      context: 'k8s',
      namespaces: ['prod'] as const
    }
  },
  
  // Original syntax with helpers
  services: (h) => ({
    api: {
      expose: 'public',
      listen: { kind: 'http', protocol: 'https', port: port(443) },
      needs: ['db'],
      public: {
        ns: 'prod',
        host: h.hostFor('prod', 'api'),
        basePath: h.path('/v1')
      }
    },
    db: {
      expose: 'cluster',
      listen: { kind: 'tcp', port: port(5432) }
    }
  })
})

// Should resolve
const resolved = resolveDSL(config)

// Type check
type _Check = typeof resolved.services.api
