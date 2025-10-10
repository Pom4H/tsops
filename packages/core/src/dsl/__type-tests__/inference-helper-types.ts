/**
 * Inference: Helper function types
 * Verifies that $ helper is correctly typed
 */

import { smart, fqdn } from '../../index.js'

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
      apiServer: 'https://k8s.internal:6443',
      context: 'k8s',
      namespaces: ['us-prod', 'eu-prod'] as const
    }
  },
  
  // $ helper should have correct type
  services: $ => {
    // Check helper functions exist
    const _host: string = $('us-prod', 'api')
    const _path: any = $.path('/v1')
    const _url: string = $.url('https', 'api.example.com', '/v1')
    const _secret: string = $.secret('db', 'password')
    
    // Full helpers available
    const _full = $.full
    
    return {
      api: {
        host: $('us-prod', 'api'),
        path: $.path('/v1'),
        port: 443,
        protocol: 'https'
      }
    }
  }
})
