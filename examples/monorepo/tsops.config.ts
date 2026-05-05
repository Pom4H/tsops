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
        context: 'examples/monorepo',
        dockerfile: 'examples/monorepo/apps/backend/Dockerfile',
        inputs: [
          'apps/backend/**',
          'package.json',
          'pnpm-lock.yaml',
          'pnpm-workspace.yaml',
          'turbo.json',
          'tsconfig.base.json'
        ],
        cache: { type: 'registry', mode: 'max' },
        env: { DOCKER_BUILDKIT: '1' },
        args: {
          PACKAGE_NAME: '@monorepo/backend',
          SERVICE_DIR: 'apps/backend',
          NODE_VERSION: '24'
        }
      },
      env: ({ secret }) => ({
        PORT: '4000',
        API_TOKEN: secret('monorepo-backend-env', 'API_TOKEN2')
        // ✅ For service discovery, use runtime config: config.url('frontend', 'service')
      }),
      ports: [
        { name: 'http', port: 4000, targetPort: 4000 }
      ],
      ingress: ({ domain }) => ({ domain: `api.${domain}` })
    },
    frontend: {
      build: {
        type: 'dockerfile',
        context: 'examples/monorepo',
        dockerfile: 'examples/monorepo/apps/frontend/Dockerfile',
        inputs: [
          'apps/frontend/**',
          'package.json',
          'pnpm-lock.yaml',
          'pnpm-workspace.yaml',
          'turbo.json',
          'tsconfig.base.json'
        ],
        cache: { type: 'registry', mode: 'max' },
        env: { DOCKER_BUILDKIT: '1' },
        args: {
          PACKAGE_NAME: '@monorepo/frontend',
          SERVICE_DIR: 'apps/frontend',
          NODE_VERSION: '24'
        }
      },
      env: () => ({
        PORT: '3000',
        NEXT_PUBLIC_WS_URL: 'wss://monorepo.localtest.me/ws'
        // ✅ For API calls, use DNS: fetch('http://backend/api/data')
      }),
      ports: [
        { name: 'http', port: 80, targetPort: 3000 }
      ],
      ingress: ({ domain }) => ({ domain: `web.${domain}` })
    }
  }
})

export default config
