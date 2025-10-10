/**
 * Valid: Backwards compatibility
 * Both old and new APIs should work together
 */

import { 
  defineDSL,
  smart,
  resolveDSL,
  resolve,
  fqdn,
  port 
} from '../../index.js'

// Old API
const oldConfig = defineDSL({
  project: 'old',
  regions: { us: fqdn('old.com') },
  namespaces: { prod: { region: 'us' } },
  clusters: {
    k8s: {
      apiServer: 'https://k8s.internal:6443',
      context: 'k8s',
      namespaces: ['prod'] as const
    }
  },
  services: (h) => ({
    api: {
      listen: { kind: 'http', protocol: 'https', port: port(443) },
      public: {
        ns: 'prod',
        host: h.hostFor('prod', 'api'),
        basePath: h.path('/')
      }
    }
  })
})

// New API
const newConfig = smart({
  project: 'new',
  regions: { us: fqdn('new.com') },
  namespaces: { prod: { region: 'us' } },
  clusters: {
    k8s: {
      apiServer: 'https://k8s.internal:6443',
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

// Both resolvers should work
const oldResolved = resolveDSL(oldConfig)
const newResolved = resolve(newConfig)

// Type checks
type _OldType = typeof oldResolved.services.api
type _NewType = typeof newResolved.services.api
