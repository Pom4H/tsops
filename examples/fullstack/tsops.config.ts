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
      env: ({ serviceDNS }) => ({
        PORT: '8080',
        FRONTEND_URL: serviceDNS('frontend', { protocol: 'http', port: 80 })
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
      env: ({ serviceDNS }) => ({
        PORT: '3000',
        NEXT_PUBLIC_API_BASE_URL: serviceDNS('backend', { protocol: 'http', port: 8080 })
      }),
      ports: [
        { name: 'http', port: 80, targetPort: 3000 }
      ],
      network: 'fullstack2.localtest.me'
    }
  }
})

export default config
