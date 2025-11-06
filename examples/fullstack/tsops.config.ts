import { defineConfig } from 'tsops'

const config = defineConfig({
  project: 'tsops-fullstack-demo',
  namespaces: {
    local: {}
  },
  clusters: {
    local: {
      apiServer: 'https://kubernetes.docker.internal:6443',
      context: 'docker-desktop',
      namespaces: ['local']
    }
  },
  images: {
    registry: 'ghcr.io/example/tsops',
    tagStrategy: 'git-sha',
    includeProjectInName: true
  },
  apps: {
    backend: {
      build: {
        type: 'dockerfile',
        context: 'examples/fullstack/backend',
        dockerfile: 'examples/fullstack/backend/Dockerfile'
      },
      env: () => ({
        PORT: '8080'
        // ✅ For service discovery, use runtime config: config.url('frontend', 'service')
      }),
      ports: [
        { name: 'http', port: 8080, targetPort: 8080 }
      ]
    },
    frontend: {
      build: {
        type: 'dockerfile',
        context: 'examples/fullstack/frontend',
        dockerfile: 'examples/fullstack/frontend/Dockerfile'
      },
      env: () => ({
        PORT: '3000'
        // ✅ For API calls, use DNS: fetch('http://backend/api/data')
      }),
      ports: [
        { name: 'http', port: 80, targetPort: 3000 }
      ],
      ingress: { domain: 'fullstack2.localtest.me' }
    }
  }
})

export default config
