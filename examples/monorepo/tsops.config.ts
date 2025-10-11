import { defineConfig } from 'tsops'

const config = defineConfig({
  project: 'tsops-monorepo-demo',
  namespaces: {
    local: { domain: 'monorepo.localtest.me' },
    prod: { domain: 'monorepo.example.com' }
  },
  clusters: {
    local: {
      apiServer: 'https://kubernetes.docker.internal:6443',
      context: 'docker-desktop',
      namespaces: ['local']
    },
    prod: {
      apiServer: 'https://prod.local:6443',
      context: 'prod',
      namespaces: ['prod']
    }
  },
  images: {
    registry: 'ghcr.io/acme',
    tagStrategy: 'git-sha',
    includeProjectInName: true
  },
  secrets: {
    'monorepo-backend-env': () => ({
      API_TOKEN: process.env.BACKEND_API_TOKEN ?? 'dev-token'
    })
  },
  apps: {
    backend: {
      build: {
        type: 'dockerfile',
        context: 'examples/monorepo/apps/backend',
        dockerfile: 'examples/monorepo/apps/backend/Dockerfile',
        env: { DOCKER_BUILDKIT: '1' },
        args: {
          PACKAGE_NAME: '@monorepo/backend',
          SERVICE_DIR: 'apps/backend',
          NODE_VERSION: '24'
        }
      },
      env: ({ url, secret }) => ({
        PORT: '4000',
        FRONTEND_URL: url('frontend', 'cluster'),
        API_TOKEN: secret('monorepo-backend-env', 'API_TOKEN2')
      }),
      ports: [
        { name: 'http', port: 4000, targetPort: 4000 }
      ],
      ingress: ({ domain }) => `api.${domain}`
    },
    frontend: {
      build: {
        type: 'dockerfile',
        context: 'examples/monorepo/apps/frontend',
        dockerfile: 'examples/monorepo/apps/frontend/Dockerfile',
        env: { DOCKER_BUILDKIT: '1' },
        args: {
          PACKAGE_NAME: '@monorepo/frontend',
          SERVICE_DIR: 'apps/frontend',
          NODE_VERSION: '24'
        }
      },
      env: ({ url }) => ({
        PORT: '3000',
        NEXT_PUBLIC_WS_URL: 'wss://monorepo.localtest.me/ws',
        NEXT_PUBLIC_API_BASE_URL: url('backend', 'cluster')
      }),
      ports: [
        { name: 'http', port: 80, targetPort: 3000 }
      ],
      ingress: ({ domain }) => `web.${domain}`
    }
  }
})

export default config
