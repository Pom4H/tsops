import { defineConfig } from '@tsops/core'

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
    'monorepo-backend-env': (ctx: { env: (key: string, fallback?: string) => string }) => ({
      API_TOKEN: ctx.env('BACKEND_API_TOKEN', '')
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
      env: ({ serviceDNS, secret }) => ({
        PORT: '4000',
        FRONTEND_URL: serviceDNS('frontend', { protocol: 'http', port: 80 }),
        API_TOKEN: secret('monorepo-backend-env', 'API_TOKEN')
      }),
      ports: [
        { name: 'http', port: 4000, targetPort: 4000 }
      ],
      network: ({ domain }) => `api.${domain}`
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
      env: ({ serviceDNS }) => ({
        PORT: '3000',
        NEXT_PUBLIC_WS_URL: 'wss://monorepo.localtest.me/ws',
        NEXT_PUBLIC_API_BASE_URL: serviceDNS('backend', { protocol: 'http', port: 4000 })
      }),
      ports: [
        { name: 'http', port: 80, targetPort: 3000 }
      ],
      network: ({ domain }) => `web.${domain}`
    }
  }
})

export default config
