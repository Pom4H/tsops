import {
  createConfigResolver,
  type KubectlClient,
  type SupportedManifest,
  TsOps
} from '@tsops/core'
import { defineConfig } from 'tsops'
import { describe, expect, it } from 'vitest'

const noopLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {}
}

const noopDocker = {
  async login() {},
  async imageExists() {
    return false
  },
  async build() {},
  async push() {}
}

class FakeKubectl implements KubectlClient {
  applied: Array<{ manifest: SupportedManifest; namespace: string }> = []
  deleted: Array<{ kind: string; name: string; namespace: string }> = []
  getCalls: Array<{ kind: string; name: string; namespace: string }> = []
  waited: Array<{ name: string; namespace: string; timeoutSeconds?: number }> = []
  private readonly objects = new Map<string, SupportedManifest>()

  seed(manifest: SupportedManifest) {
    this.objects.set(
      keyFor(
        manifest.kind ?? '',
        manifest.metadata?.name ?? '',
        manifest.metadata?.namespace ?? ''
      ),
      manifest
    )
  }

  async apply(manifest: SupportedManifest, options: { namespace: string }) {
    this.applied.push({ manifest, namespace: options.namespace })
    this.seed(manifest)
    return `${manifest.kind}/${manifest.metadata?.name}`
  }

  async applyBatch(manifests: SupportedManifest[], options: { namespace: string }) {
    const refs: string[] = []
    for (const manifest of manifests) {
      refs.push(await this.apply(manifest, options))
    }
    return refs
  }

  async secretExists(secretName: string, namespace: string) {
    return this.objects.has(keyFor('Secret', secretName, namespace))
  }

  async getSecretData(secretName: string, namespace: string) {
    const secret = this.objects.get(keyFor('Secret', secretName, namespace)) as
      | (SupportedManifest & { data?: Record<string, string>; stringData?: Record<string, string> })
      | undefined
    if (!secret) return null
    if (secret.stringData) return secret.stringData
    if (!secret.data) return null
    return Object.fromEntries(
      Object.entries(secret.data).map(([key, value]) => [
        key,
        looksBase64(value) ? Buffer.from(value, 'base64').toString('utf8') : value
      ])
    )
  }

  async validate() {
    return true
  }

  async get(kind: string, name: string, namespace: string) {
    this.getCalls.push({ kind, name, namespace })
    return this.objects.get(keyFor(kind, name, namespace)) ?? null
  }

  async diff() {
    return null
  }

  async list() {
    return []
  }

  async delete(kind: string, name: string, namespace: string) {
    this.deleted.push({ kind, name, namespace })
    return `${kind}/${name}`
  }

  async waitForJob(name: string, namespace: string, options?: { timeoutSeconds?: number }) {
    this.waited.push({ name, namespace, timeoutSeconds: options?.timeoutSeconds })
  }
}

function keyFor(kind: string, name: string, namespace: string) {
  return `${kind}:${namespace}:${name}`
}

function secret(name: string, namespace: string, data: Record<string, string>, type = 'Opaque') {
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    type,
    metadata: { name, namespace },
    data
  } as unknown as SupportedManifest
}

function looksBase64(value: string) {
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length % 4 === 0
}

function decodeSecretData(manifest: SupportedManifest) {
  const data = (manifest as unknown as { data?: Record<string, string> }).data ?? {}
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, Buffer.from(value, 'base64').toString('utf8')])
  )
}

function makeTsOps(config: ReturnType<typeof makePreviewConfig>, kubectl: FakeKubectl) {
  return new TsOps(config as any, {
    docker: noopDocker,
    kubectl,
    logger: noopLogger
  })
}

function makePreviewConfig(previewOverrides: Record<string, unknown> = {}) {
  return defineConfig({
    project: 'worken-preview',
    namespaces: {
      staging: {
        domain: 'stage.worken.ru'
      },
      preview: {
        extends: 'staging' as const,
        naming: ({ pr }: { pr: string }) => `pr-${pr}`,
        domain: ({ pr }: { pr: string }) => `pr-${pr}.stage.worken.ru`,
        fallback: 'staging' as const,
        ...previewOverrides
      }
    },
    clusters: {
      stage: {
        apiServer: 'https://stage:6443',
        context: 'stage',
        namespaces: ['staging', 'preview'] as const
      }
    },
    images: {
      registry: 'ghcr.io/worken',
      tagStrategy: 'git-sha' as const
    },
    apps: {
      'worken-api': {
        image: 'ghcr.io/worken/worken-api:test',
        ingress: ({ domain }: { domain: string }) => ({ domain: `api.${domain}`, port: 3000 }),
        ports: [{ name: 'http', port: 3000, targetPort: 3000 }]
      },
      'worken-front': {
        image: 'ghcr.io/worken/worken-front:test',
        ingress: ({ domain }: { domain: string }) => ({ domain }),
        ports: [{ name: 'http', port: 3000, targetPort: 3000 }]
      }
    }
  })
}

function applied(kubectl: FakeKubectl, kind: string, name?: string) {
  return kubectl.applied
    .map((item) => item.manifest)
    .filter((manifest) => manifest.kind === kind && (!name || manifest.metadata?.name === name))
}

describe('overlay lifecycle preview contract', () => {
  it('copies wildcard TLS from explicit sourceNamespace before public routes are applied', async () => {
    const kubectl = new FakeKubectl()
    kubectl.seed(
      secret(
        'staging-wildcard-tls',
        'kube-system',
        { 'tls.crt': 'crt', 'tls.key': 'key' },
        'kubernetes.io/tls'
      )
    )

    const config = makePreviewConfig({
      cert: {
        mode: 'wildcard-shared',
        secretName: 'staging-wildcard-tls',
        sourceNamespace: 'kube-system',
        copyToOverlayNamespace: true
      }
    })
    await makeTsOps(config, kubectl).deploy({ namespace: 'preview', vars: { pr: '857' } })

    expect(kubectl.getCalls).toContainEqual({
      kind: 'Secret',
      name: 'staging-wildcard-tls',
      namespace: 'kube-system'
    })
    const copied = applied(kubectl, 'Secret', 'staging-wildcard-tls')[0] as any
    expect(copied.metadata.namespace).toBe('pr-857')
    expect(copied.type).toBe('kubernetes.io/tls')

    const copyIndex = kubectl.applied.findIndex(
      ({ manifest }) =>
        manifest.kind === 'Secret' && manifest.metadata?.name === 'staging-wildcard-tls'
    )
    const routeIndex = kubectl.applied.findIndex(({ manifest }) => manifest.kind === 'Ingress')
    expect(copyIndex).toBeGreaterThan(-1)
    expect(routeIndex).toBeGreaterThan(copyIndex)

    const ingress = applied(kubectl, 'Ingress', 'worken-api-ingress')[0] as any
    expect(ingress.spec.tls).toEqual([
      {
        secretName: 'staging-wildcard-tls',
        hosts: ['api.pr-857.stage.worken.ru']
      }
    ])
  })

  it('renders preview ingress backends with the app ingress port', async () => {
    const kubectl = new FakeKubectl()
    const config = makePreviewConfig({
      cert: {
        mode: 'wildcard-shared',
        secretName: 'stage-worken-ru-wildcard-tls',
        sourceNamespace: 'kube-system',
        copyToOverlayNamespace: true
      }
    })
    kubectl.seed(
      secret(
        'stage-worken-ru-wildcard-tls',
        'kube-system',
        { 'tls.crt': 'crt', 'tls.key': 'key' },
        'kubernetes.io/tls'
      )
    )

    await makeTsOps(config, kubectl).deploy({ namespace: 'preview', vars: { pr: '857' } })

    const ingress = applied(kubectl, 'Ingress', 'worken-api-ingress')[0] as any
    expect(ingress.spec.rules[0].http.paths[0].backend.service).toEqual({
      name: 'worken-api',
      port: { number: 3000 }
    })
  })

  it('defaults preview ingress backends to the first declared service port', async () => {
    const kubectl = new FakeKubectl()
    const config = makePreviewConfig()

    await makeTsOps(config, kubectl).deploy({ namespace: 'preview', vars: { pr: '857' } })

    const ingress = applied(kubectl, 'Ingress', 'worken-front-ingress')[0] as any
    expect(ingress.spec.rules[0].http.paths[0].backend.service).toEqual({
      name: 'worken-front',
      port: { number: 3000 }
    })
  })

  it('applies wildcard TLS and access middleware to fallback preview routes', async () => {
    const kubectl = new FakeKubectl()
    kubectl.seed(
      secret(
        'stage-worken-ru-wildcard-tls',
        'kube-system',
        { 'tls.crt': 'crt', 'tls.key': 'key' },
        'kubernetes.io/tls'
      )
    )
    kubectl.seed(secret('preview-basic-auth', 'kube-system', { users: 'hashed-users' }))

    const config = makePreviewConfig({
      cert: {
        mode: 'wildcard-shared',
        secretName: 'stage-worken-ru-wildcard-tls',
        sourceNamespace: 'kube-system',
        copyToOverlayNamespace: true
      },
      access: {
        mode: 'traefik-basic-auth',
        sourceNamespace: 'kube-system',
        secretName: 'preview-basic-auth',
        middlewareName: ({ pr }: { pr: string }) => `preview-basic-auth-pr-${pr}`,
        attachTo: 'all-public-routes',
        failClosed: true
      }
    })

    await makeTsOps(config, kubectl).deploy({
      namespace: 'preview',
      vars: { pr: '857' },
      include: ['worken-api']
    })

    const fallbackIngress = applied(kubectl, 'Ingress', 'worken-front-ingress')[0] as any
    expect(
      fallbackIngress.metadata.annotations['traefik.ingress.kubernetes.io/router.middlewares']
    ).toBe('pr-857-preview-basic-auth-pr-857@kubernetescrd')
    expect(fallbackIngress.spec.tls).toEqual([
      {
        secretName: 'stage-worken-ru-wildcard-tls',
        hosts: ['pr-857.stage.worken.ru']
      }
    ])
  })

  it('fails closed and attaches Traefik BasicAuth middleware to every public preview route', async () => {
    const missing = new FakeKubectl()
    const config = makePreviewConfig({
      access: {
        mode: 'traefik-basic-auth',
        sourceNamespace: 'kube-system',
        secretName: 'preview-basic-auth',
        middlewareName: ({ pr }: { pr: string }) => `preview-basic-auth-pr-${pr}`,
        attachTo: 'all-public-routes',
        failClosed: true
      }
    })

    await expect(
      makeTsOps(config, missing).deploy({ namespace: 'preview', vars: { pr: '857' } })
    ).rejects.toThrow(/preview-basic-auth.*kube-system/)

    const kubectl = new FakeKubectl()
    kubectl.seed(secret('preview-basic-auth', 'kube-system', { users: 'hashed-users' }))

    await makeTsOps(config, kubectl).deploy({ namespace: 'preview', vars: { pr: '857' } })

    const copied = applied(kubectl, 'Secret', 'preview-basic-auth')[0] as any
    expect(copied.metadata.namespace).toBe('pr-857')
    const middleware = applied(kubectl, 'Middleware', 'preview-basic-auth-pr-857')[0] as any
    expect(middleware.spec.basicAuth.secret).toBe('preview-basic-auth')

    for (const ingress of applied(kubectl, 'Ingress') as any[]) {
      expect(ingress.metadata.annotations['traefik.ingress.kubernetes.io/router.middlewares']).toBe(
        'pr-857-preview-basic-auth-pr-857@kubernetescrd'
      )
    }
  })

  it('applies ResourceQuota and LimitRange before preview app workloads', async () => {
    const kubectl = new FakeKubectl()
    const config = makePreviewConfig({
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
      }
    })

    await makeTsOps(config, kubectl).deploy({ namespace: 'preview', vars: { pr: '857' } })

    const kinds = kubectl.applied.map(({ manifest }) => manifest.kind)
    expect(kinds).toContain('ResourceQuota')
    expect(kinds).toContain('LimitRange')
    expect(kinds.indexOf('ResourceQuota')).toBeLessThan(kinds.indexOf('Deployment'))
    expect(kinds.indexOf('LimitRange')).toBeLessThan(kinds.indexOf('Deployment'))
  })

  it('copies explicit base app secrets into the overlay before included app rollout', async () => {
    const kubectl = new FakeKubectl()
    kubectl.seed(
      secret('stage', 'ru-stage', {
        DATABASE_URL: Buffer.from('postgresql://worken:secret@postgres:5432/worken').toString(
          'base64'
        ),
        AUTH_YANDEX_ID: ''
      })
    )

    const config = defineConfig({
      project: 'worken-preview',
      namespaces: {
        'ru-stage': {
          domain: 'stage.worken.ru'
        },
        preview: {
          extends: 'ru-stage' as const,
          naming: ({ pr }: { pr: string }) => `pr-${pr}`,
          domain: ({ pr }: { pr: string }) => `pr-${pr}.stage.worken.ru`,
          fallback: 'ru-stage' as const,
          appSecrets: {
            sourceNamespace: 'ru-stage',
            names: ['stage']
          }
        }
      },
      clusters: {
        stage: {
          apiServer: 'https://stage:6443',
          context: 'stage',
          namespaces: ['ru-stage', 'preview'] as const
        }
      },
      images: {
        registry: 'ghcr.io/worken',
        tagStrategy: 'git-sha' as const
      },
      secrets: {
        stage: {
          DATABASE_URL: undefined as unknown as string,
          AUTH_YANDEX_ID: undefined as unknown as string
        }
      },
      apps: {
        'worken-api': {
          image: 'ghcr.io/worken/worken-api:test',
          env: ({ secret }: any) => ({
            DATABASE_URL: secret('stage', 'DATABASE_URL'),
            AUTH_YANDEX_ID: secret('stage', 'AUTH_YANDEX_ID')
          }),
          ingress: ({ domain }: { domain: string }) => ({ domain: `api.${domain}` }),
          ports: [{ name: 'http', port: 80, targetPort: 3000 }]
        }
      }
    } as any)

    await makeTsOps(config, kubectl).deploy({
      namespace: 'preview',
      vars: { pr: '857' },
      include: ['worken-api']
    })

    expect(kubectl.getCalls).toContainEqual({
      kind: 'Secret',
      name: 'stage',
      namespace: 'ru-stage'
    })
    const copied = applied(kubectl, 'Secret', 'stage')[0] as any
    expect(copied.metadata.namespace).toBe('pr-857')
    expect(decodeSecretData(copied).DATABASE_URL).toBe(
      'postgresql://worken:secret@postgres:5432/worken'
    )
    expect(decodeSecretData(copied).AUTH_YANDEX_ID).toBe('')

    const secretIndex = kubectl.applied.findIndex(
      ({ manifest }) => manifest.kind === 'Secret' && manifest.metadata?.name === 'stage'
    )
    const deploymentIndex = kubectl.applied.findIndex(
      ({ manifest }) => manifest.kind === 'Deployment'
    )
    expect(secretIndex).toBeGreaterThan(-1)
    expect(deploymentIndex).toBeGreaterThan(secretIndex)
  })

  it('injects generated per-preview runtime database secret refs into app pods', async () => {
    const config = makePreviewConfig({
      database: {
        lifecycleUrlSecret: {
          name: 'staging-db-lifecycle',
          key: 'DATABASE_URL',
          sourceNamespace: 'kube-system'
        },
        runtimeSecret: {
          mode: 'generated-per-overlay',
          name: ({ pr }: { pr: string }) => `pr-${pr}-db-app`,
          key: 'DATABASE_URL'
        },
        runtimeRole: ({ pr }: { pr: string }) => `worken_pr_${pr}_app`,
        schema: ({ pr }: { pr: string }) => `pr_${pr}`,
        preDeploy: 'create-schema',
        postDestroy: 'drop-schema'
      }
    })

    const plan = await makeTsOps(config, new FakeKubectl()).plan({
      namespace: 'preview',
      vars: { pr: '857' }
    })
    const entry = plan.entries.find((item) => item.app === 'worken-api')
    if (!entry) throw new Error('Expected worken-api plan entry')
    expect(entry.env.DATABASE_SCHEMA).toBe('pr_857')
    expect(entry.env.DATABASE_RUNTIME_ROLE).toBe('worken_pr_857_app')
    expect(entry.env.DATABASE_URL).toEqual({
      __type: 'SecretRef',
      secretName: 'pr-857-db-app',
      key: 'DATABASE_URL'
    })
  })

  it('creates generated per-preview runtime database secret before database hooks and app rollout', async () => {
    const kubectl = new FakeKubectl()
    kubectl.seed(
      secret('staging-db-lifecycle', 'kube-system', {
        DATABASE_URL:
          'postgresql://stage_admin:adminpass@postgres.stage:5432/worken?sslmode=require'
      })
    )

    const config = makePreviewConfig({
      database: {
        lifecycleUrlSecret: {
          name: 'staging-db-lifecycle',
          key: 'DATABASE_URL',
          sourceNamespace: 'kube-system'
        },
        runtimeSecret: {
          mode: 'generated-per-overlay',
          name: ({ pr }: { pr: string }) => `pr-${pr}-db-app`,
          key: 'DATABASE_URL'
        },
        runtimeRole: ({ pr }: { pr: string }) => `worken_pr_${pr}_app`,
        schema: ({ pr }: { pr: string }) => `pr_${pr}`,
        preDeploy: {
          mode: 'job',
          name: ({ pr }: { pr: string }) => `preview-db-prepare-pr-${pr}`,
          image: 'ghcr.io/worken/preview-db-prepare:test'
        },
        postDestroy: 'drop-schema'
      }
    })

    await makeTsOps(config, kubectl).deploy({
      namespace: 'preview',
      vars: { pr: '857' }
    })

    const runtimeSecret = applied(kubectl, 'Secret', 'pr-857-db-app')[0] as any
    expect(runtimeSecret.metadata.namespace).toBe('pr-857')
    const runtimeData = decodeSecretData(runtimeSecret)
    expect(runtimeData.DATABASE_URL).toMatch(
      /^postgresql:\/\/worken_pr_857_app:[^@]+@postgres\.stage:5432\/worken\?sslmode=require$/
    )
    expect(runtimeData.DATABASE_URL).not.toContain('stage_admin')
    expect(runtimeData.DATABASE_URL).not.toContain('adminpass')
    expect(runtimeData.DATABASE_SCHEMA).toBe('pr_857')
    expect(runtimeData.DATABASE_RUNTIME_ROLE).toBe('worken_pr_857_app')
    expect(runtimeData.DATABASE_PASSWORD).toMatch(/^[A-Za-z0-9_-]{32,}$/)

    const job = applied(kubectl, 'Job', 'preview-db-prepare-pr-857')[0] as any
    const env = Object.fromEntries(
      job.spec.template.spec.containers[0].env.map((item: any) => [
        item.name,
        item.value ?? item.valueFrom
      ])
    )
    expect(env.DATABASE_RUNTIME_URL.secretKeyRef).toEqual({
      name: 'pr-857-db-app',
      key: 'DATABASE_URL'
    })
    expect(env.DATABASE_RUNTIME_PASSWORD.secretKeyRef).toEqual({
      name: 'pr-857-db-app',
      key: 'DATABASE_PASSWORD'
    })

    const runtimeSecretIndex = kubectl.applied.findIndex(
      ({ manifest }) => manifest.kind === 'Secret' && manifest.metadata?.name === 'pr-857-db-app'
    )
    const jobIndex = kubectl.applied.findIndex(
      ({ manifest }) =>
        manifest.kind === 'Job' && manifest.metadata?.name === 'preview-db-prepare-pr-857'
    )
    const deploymentIndex = kubectl.applied.findIndex(
      ({ manifest }) => manifest.kind === 'Deployment'
    )
    expect(runtimeSecretIndex).toBeGreaterThan(-1)
    expect(jobIndex).toBeGreaterThan(runtimeSecretIndex)
    expect(deploymentIndex).toBeGreaterThan(jobIndex)
  })

  it('runs named job-mode database hooks with vars, generated runtime metadata, and timeout', async () => {
    const kubectl = new FakeKubectl()
    kubectl.seed(
      secret('staging-db-lifecycle', 'kube-system', { DATABASE_URL: 'postgres://stage' })
    )

    const config = makePreviewConfig({
      database: {
        lifecycleUrlSecret: {
          name: 'staging-db-lifecycle',
          key: 'DATABASE_URL',
          sourceNamespace: 'kube-system'
        },
        runtimeSecret: {
          mode: 'generated-per-overlay',
          name: ({ pr }: { pr: string }) => `pr-${pr}-db-app`,
          key: 'DATABASE_URL'
        },
        runtimeRole: ({ pr }: { pr: string }) => `worken_pr_${pr}_app`,
        schema: ({ pr }: { pr: string }) => `pr_${pr}`,
        preDeploy: {
          mode: 'job',
          name: ({ pr }: { pr: string }) => `preview-db-prepare-pr-${pr}`,
          image: 'ghcr.io/worken/preview-db-prepare:test',
          timeoutSeconds: 600,
          env: ({ seed }: { seed?: string }) => ({
            PREVIEW_SEED_MODE: seed ?? 'demo'
          }),
          logs: 'tail-on-failure'
        },
        postDestroy: 'drop-schema'
      }
    })

    await makeTsOps(config, kubectl).deploy({
      namespace: 'preview',
      vars: { pr: '857', seed: 'demo' }
    })

    const copied = applied(kubectl, 'Secret', 'staging-db-lifecycle')[0] as any
    expect(copied.metadata.namespace).toBe('pr-857')
    const job = applied(kubectl, 'Job', 'preview-db-prepare-pr-857')[0] as any
    const env = Object.fromEntries(
      job.spec.template.spec.containers[0].env.map((item: any) => [
        item.name,
        item.value ?? item.valueFrom
      ])
    )
    expect(env.DATABASE_SCHEMA).toBe('pr_857')
    expect(env.DATABASE_RUNTIME_ROLE).toBe('worken_pr_857_app')
    expect(env.DATABASE_RUNTIME_SECRET_NAME).toBe('pr-857-db-app')
    expect(env.PREVIEW_SEED_MODE).toBe('demo')
    expect(env.DATABASE_URL.secretKeyRef).toEqual({
      name: 'staging-db-lifecycle',
      key: 'DATABASE_URL'
    })
    expect(kubectl.waited).toContainEqual({
      name: 'preview-db-prepare-pr-857',
      namespace: 'pr-857',
      timeoutSeconds: 600
    })
  })

  it('guards schema teardown before cascade and revokes generated runtime role', async () => {
    const kubectl = new FakeKubectl()
    kubectl.seed(secret('stage-db-lifecycle', 'kube-system', { DATABASE_URL: 'postgres://stage' }))

    const config = makePreviewConfig({
      database: {
        lifecycleUrlSecret: {
          name: 'stage-db-lifecycle',
          key: 'DATABASE_URL',
          sourceNamespace: 'kube-system'
        },
        runtimeSecret: {
          mode: 'generated-per-overlay',
          name: ({ pr }: { pr: string }) => `pr-${pr}-db-app`,
          key: 'DATABASE_URL'
        },
        runtimeRole: ({ pr }: { pr: string }) => `worken_pr_${pr}_app`,
        schema: ({ pr }: { pr: string }) => `pr_${pr}`,
        preDeploy: 'create-schema',
        postDestroy: 'drop-schema'
      }
    })

    await makeTsOps(config, kubectl).down({
      namespace: 'preview',
      vars: { pr: '857' }
    })

    const job = applied(kubectl, 'Job', 'tsops-db-drop-pr-857')[0] as any
    const command = job.spec.template.spec.containers[0].args[0] as string

    expect(command).toContain('pg_depend')
    expect(command).toContain('cross-schema dependencies')
    expect(command).toContain('DO \\$tsops\\$')
    expect(command).not.toContain('DO $tsops$')
    expect(command.indexOf('pg_depend')).toBeLessThan(command.indexOf('DROP SCHEMA'))
    expect(command).toContain(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA \\"pr_857\\" REVOKE ALL ON TABLES FROM \\"worken_pr_857_app\\"'
    )
    expect(command).toContain(
      'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA \\"pr_857\\" FROM \\"worken_pr_857_app\\"'
    )
    expect(command).toContain('DROP SCHEMA IF EXISTS \\"pr_857\\" CASCADE')
    expect(command).toContain('DROP ROLE IF EXISTS \\"worken_pr_857_app\\"')
    expect(kubectl.waited).toContainEqual({
      name: 'tsops-db-drop-pr-857',
      namespace: 'pr-857',
      timeoutSeconds: undefined
    })
  })

  it('supports overlay runtime variable validation so raw integrations=real fails closed in V1', () => {
    const config = makePreviewConfig({
      validateVars: ({ integrations }: { integrations?: string }) => {
        if (integrations === 'real') {
          throw new Error('real integrations are not enabled for V1 preview overlays')
        }
      }
    } as any)

    const resolver = createConfigResolver(config)
    expect(() =>
      resolver.namespaces.resolve('preview', { pr: '857', integrations: 'real' })
    ).toThrow(/real integrations are not enabled/)
  })
})
