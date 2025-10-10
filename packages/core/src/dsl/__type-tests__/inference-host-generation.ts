/**
 * Inference: Host generation from namespace + subdomain
 * Verifies that hosts are correctly inferred
 */

import { smart, fqdn, resolve } from '../../index.js'

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
      path: '/v1',
      port: 443,
      protocol: 'https'
    }
  }
})

// Resolve and check type inference
const resolved = resolve(config)

// Type checks
type ResolvedType = typeof resolved
type ServicesType = ResolvedType['services']
type ApiService = ServicesType['api']

// Should have public config
type _PublicCheck = ApiService['public']

// Verify structure
const _check1: ResolvedType['project'] = 'test'
const _check2: keyof ResolvedType['services'] = 'api'
