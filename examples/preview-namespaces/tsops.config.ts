import { defineConfig } from 'tsops'

/**
 * Example: PR preview namespaces (RFC 0001).
 *
 * Static `staging` is the long-lived staging cluster. The `preview` overlay
 * is materialised at deploy time per pull request via:
 *
 *   tsops up preview --var pr=123 --var branch=feature-x \
 *     --include worken-front
 *
 * Apps not in `--include` (e.g. `api`) become Service: ExternalName entries
 * pointing at the same Service in `staging`, so the preview env stays
 * fully routable while only the changed app is freshly deployed.
 *
 * `tsops down preview --var pr=123` runs the postDestroy schema cleanup and
 * deletes the namespace.
 */
const config = defineConfig({
  project: 'preview-demo',
  namespaces: {
    'staging': {
      domain: 'staging.example.com',
      region: 'ru'
    },
    preview: {
      extends: 'staging',
      naming: ({ pr }) => `pr-${pr}`,
      domain: ({ pr }) => `pr-${pr}.staging.example.com`,
      fallback: 'staging',
      // Reuse the staging wildcard cert. The source lives outside the base
      // app namespace, so sourceNamespace is explicit and tsops copies the
      // secret into each preview namespace before public routes are applied.
      cert: {
        mode: 'wildcard-shared',
        secretName: 'staging-wildcard-tls',
        sourceNamespace: 'kube-system',
        copyToOverlayNamespace: true
      },
      access: {
        mode: 'traefik-basic-auth',
        sourceNamespace: 'kube-system',
        secretName: 'preview-basic-auth',
        middlewareName: ({ pr }) => `preview-basic-auth-pr-${pr}`,
        attachTo: 'all-public-routes',
        failClosed: true
      },
      namespacePolicy: {
        resourceQuota: {
          pods: 25,
          secrets: 50,
          jobs: 20,
          requestsCpu: '4',
          requestsMemory: '8Gi',
          limitsCpu: '8',
          limitsMemory: '16Gi',
          persistentVolumeClaims: 0
        },
        limitRange: {
          defaultRequestCpu: '100m',
          defaultRequestMemory: '256Mi',
          defaultLimitCpu: '500m',
          defaultLimitMemory: '1Gi'
        }
      },
      validateVars: ({ integrations }) => {
        if (integrations === 'real') {
          throw new Error('real integrations are not enabled for V1 preview overlays')
        }
      },
      // To issue a fresh cert per overlay instead, point `cert` at any Job
      // that produces a TLS Secret in the overlay namespace. The example
      // below uses certbot DNS-01; the same shape works for cert-manager
      // CLI tools, acme.sh containers, etc. Pick one — you don't need both.
      //
      // cert: {
      //   mode: 'job',
      //   job: {
      //     image: 'certbot/dns-cloudflare:v2.10.0',
      //     command: ['/bin/sh', '-c'],
      //     args: ['certbot certonly ... && kubectl create secret tls ...'],
      //     envFrom: [{ secretName: 'cloudflare-creds' }]
      //   }
      // },
      database: {
        lifecycleUrlSecret: {
          name: 'staging-db-lifecycle',
          key: 'DATABASE_URL',
          sourceNamespace: 'kube-system'
        },
        runtimeSecret: {
          mode: 'generated-per-overlay',
          name: ({ pr }) => `pr-${pr}-db-app`,
          key: 'DATABASE_URL'
        },
        runtimeRole: ({ pr }) => `worken_pr_${pr}_app`,
        schema: ({ pr }) => `pr_${pr}`,
        preDeploy: {
          mode: 'job',
          name: ({ pr }) => `preview-db-prepare-pr-${pr}`,
          image: `ghcr.io/example/preview-db-prepare:${process.env.GITHUB_SHA ?? 'local'}`,
          timeoutSeconds: 600,
          env: ({ seed }) => ({
            PREVIEW_SEED_MODE: seed ?? 'demo'
          }),
          logs: 'tail-on-failure'
        },
        postDestroy: 'drop-schema',
        appEnvOverride: (_vars, _baseUrl, schema) => ({
          // `runtimeSecret` injects DATABASE_URL from a generated per-preview
          // secret. Keep schema selection explicit for app/runtime adapters.
          DATABASE_SCHEMA: schema,
          WORKEN_INTEGRATIONS_MODE: 'mock'
        })
      }
    }
  },
  clusters: {
    staging: {
      apiServer: 'https://staging.example.com:6443',
      context: 'staging',
      namespaces: ['staging', 'preview']
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
