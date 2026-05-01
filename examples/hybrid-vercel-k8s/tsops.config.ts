/**
 * Hybrid Vercel + Kubernetes example.
 *
 * This config runs the frontend on Vercel and the API on Kubernetes.
 * Both are described in the same `tsops.config.ts`, and the frontend
 * imports `config.url('api', 'ingress')` to resolve the backend's URL —
 * so renaming the backend or moving it across namespaces is a compile
 * error in the Vercel-hosted code.
 *
 * NOTE: `@tsops/vercel` is currently a skeleton — see
 * `docs/guide/vercel.md`. The shape below is the target API once the
 * adapter and core integration are finished. A `tsops plan` against
 * this file will work for the `api` app today; the `web` app requires
 * the in-progress Vercel orchestrator integration.
 */

import { defineConfig } from 'tsops'
import { vercel } from '@tsops/vercel'

const config = defineConfig({
  project: 'orchard',

  namespaces: {
    dev: { domain: 'dev.example.com', production: false },
    prod: { domain: 'example.com', production: true }
  },

  clusters: {
    platform: {
      apiServer: 'https://k8s.example.com',
      context: 'prod',
      namespaces: ['dev', 'prod']
    }
  },

  images: {
    registry: 'ghcr.io/example',
    tagStrategy: 'git-sha',
    includeProjectInName: true
  },

  secrets: {
    'api-secrets': ({ production }) => ({
      JWT_SECRET: production ? process.env.JWT_SECRET ?? '' : 'dev-secret'
    }),
    'web-secrets': ({ production }) => ({
      SENTRY_DSN: production ? process.env.SENTRY_DSN ?? '' : ''
    })
  },

  apps: {
    web: {
      // Vercel-hosted frontend. No Dockerfile, no Kubernetes Service —
      // tsops just syncs project settings, env vars, and domain attachments.
      platform: vercel({
        projectId: 'prj_orchard_web',
        teamId: 'team_orchard',
        deploySource: 'git'
      }),

      ingress: ({ domain }) => ({ domain: `app.${domain}` }),

      env: ({ secret }) => ({
        SENTRY_DSN: secret('web-secrets', 'SENTRY_DSN'),
        // Build-time URL for the API — resolves to the k8s ingress.
        // This is the whole reason for the typed config: when `api` is
        // renamed, this line is a compile error.
        NEXT_PUBLIC_API_URL: 'https://api.example.com'
      })
    },

    api: {
      // Kubernetes-hosted backend. Standard tsops shape.
      build: {
        type: 'dockerfile',
        context: './apps/api',
        dockerfile: './apps/api/Dockerfile'
      },

      ingress: ({ domain }) => ({ domain: `api.${domain}` }),
      ports: [{ name: 'http', port: 80, targetPort: 8080 }],

      env: ({ production, secret }) => ({
        NODE_ENV: production ? 'production' : 'development',
        JWT_SECRET: secret('api-secrets', 'JWT_SECRET')
      })
    }
  }
})

export default config
