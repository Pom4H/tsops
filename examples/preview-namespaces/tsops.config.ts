import { defineConfig } from 'tsops'

/**
 * Example: PR preview namespaces (RFC 0001).
 *
 * Static `ru-stage` is the long-lived staging cluster. The `preview` overlay
 * is materialised at deploy time per pull request via:
 *
 *   tsops up preview --var pr=123 --var branch=feature-x \
 *     --include worken-front
 *
 * Apps not in `--include` (e.g. `api`) become Service: ExternalName entries
 * pointing at the same Service in `ru-stage`, so the preview env stays
 * fully routable while only the changed app is freshly deployed.
 *
 * `tsops down preview --var pr=123` runs the postDestroy schema cleanup and
 * deletes the namespace.
 */
const config = defineConfig({
  project: 'preview-demo',
  namespaces: {
    'ru-stage': {
      domain: 'stage.example.com',
      region: 'ru'
    },
    preview: {
      extends: 'ru-stage',
      naming: ({ pr }) => `pr-${pr}`,
      domain: ({ pr }) => `pr-${pr}.stage.example.com`,
      fallback: 'ru-stage',
      cert: {
        mode: 'wildcard-shared',
        secretName: 'stage-wildcard-tls'
      },
      database: {
        urlSecret: { name: 'stage', key: 'DATABASE_URL' },
        schema: ({ pr }) => `pr_${pr}`,
        preDeploy: 'create-schema',
        postDestroy: 'drop-schema',
        appEnvOverride: (_vars, baseUrl, schema) => ({
          DATABASE_URL: baseUrl ? `${baseUrl}?schema=${schema}` : '',
          DATABASE_SCHEMA: schema
        })
      }
    }
  },
  clusters: {
    stage: {
      apiServer: 'https://stage.example.com:6443',
      context: 'stage',
      namespaces: ['ru-stage', 'preview']
    }
  },
  images: {
    registry: 'ghcr.io/example/preview-demo',
    tagStrategy: 'git-sha'
  },
  apps: {
    'worken-front': {
      build: {
        type: 'dockerfile',
        context: 'apps/front',
        dockerfile: 'apps/front/Dockerfile'
      },
      env: ({ url }) => ({
        NEXT_PUBLIC_API: url('worken-api', 'service')
      }),
      ingress: ({ domain }) => ({ domain: domain as string }),
      ports: [{ name: 'http', port: 80, targetPort: 3000 }]
    },
    'worken-api': {
      build: {
        type: 'dockerfile',
        context: 'apps/api',
        dockerfile: 'apps/api/Dockerfile'
      },
      ports: [{ name: 'http', port: 80, targetPort: 8080 }]
    }
  }
})

export default config
