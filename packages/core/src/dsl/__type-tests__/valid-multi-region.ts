/**
 * Valid: Multi-region configuration
 * Should handle multiple regions and namespaces
 */

import { smart, fqdn } from '../../index.js'

const config = smart({
  project: 'multi-region-app',
  
  regions: {
    us: fqdn('example.com'),
    eu: fqdn('example.eu'),
    asia: fqdn('example.asia')
  },
  
  namespaces: {
    'us-prod': { region: 'us' },
    'us-dev': { region: 'us' },
    'eu-prod': { region: 'eu' },
    'asia-prod': { region: 'asia' }
  },
  
  clusters: {
    'us-k8s': {
      apiServer: 'https://us-k8s.internal:6443',
      context: 'us-k8s',
      namespaces: ['us-prod', 'us-dev'] as const
    },
    'eu-k8s': {
      apiServer: 'https://eu-k8s.internal:6443',
      context: 'eu-k8s',
      namespaces: ['eu-prod'] as const
    }
  },
  
  services: {
    api: {
      namespace: 'us-prod',
      subdomain: 'api',
      port: 443,
      protocol: 'https'
    },
    db: {
      port: 5432,
      protocol: 'tcp'
    }
  }
})
