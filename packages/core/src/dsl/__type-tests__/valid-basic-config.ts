/**
 * Valid: Basic configuration with all required fields
 * Should compile without errors
 */

import { smart, fqdn } from '../../index.js'

const config = smart({
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
  
  services: {
    api: {
      namespace: 'prod',
      subdomain: 'api',
      port: 443,
      protocol: 'https'
    }
  }
})

// Type should be inferred correctly
const _typeCheck: typeof config = config
