import { describe, expect, it, vi } from 'vitest'
import { TsOps } from '../src/core.js'
import type {
  BuildContext,
  DeployContext,
  GitInfo,
  KubectlApplyOptions,
  KubectlClient,
  KubectlDeleteOptions,
  RenderResult,
  TsOpsConfig,
  Logger
} from '../src/types.js'

type DeployLogEntry = {
  service: string
  manifests: RenderResult['manifests']
  context: DeployContext
}

type BuildLogEntry = BuildContext

type TestLogEntry = { git: GitInfo }

type Harness = {
  tsops: TsOps
  config: TsOpsConfig
  buildCalls: BuildLogEntry[]
  testCalls: TestLogEntry[]
  deployCalls: DeployLogEntry[]
  diffCalls: Array<{
    manifests: RenderResult['manifests']
  }>
  kubectl: KubectlClient & {
    apply: ReturnType<typeof vi.fn>
    diff: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  log: string[]
}

const gitInfo: GitInfo = {
  branch: 'main',
  sha: '1111111111111111111111111111111111111111',
  shortSha: '1111111',
  tag: undefined,
  hasUncommittedChanges: false
}

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {}
}

const createHarness = (): Harness => {
  const buildCalls: BuildLogEntry[] = []
  const testCalls: TestLogEntry[] = []
  const deployCalls: DeployLogEntry[] = []
  const diffCalls: Array<{ manifests: RenderResult['manifests'] }> = []
  const log: string[] = []

  const kubectl: KubectlClient & {
    apply: ReturnType<typeof vi.fn>
    diff: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  } = {
    apply: vi.fn(async (options: KubectlApplyOptions) => {
      const name = (options.manifests[0] as { metadata?: { name?: string } }).metadata?.name
      log.push(`kubectl:apply:${name}`)
    }),
    diff: vi.fn(async (options: KubectlApplyOptions) => {
      const name = (options.manifests[0] as { metadata?: { name?: string } }).metadata?.name
      log.push(`kubectl:diff:${name}`)
    }),
    delete: vi.fn(async (options: KubectlDeleteOptions) => {
      const name = (options.manifests[0] as { metadata?: { name?: string } }).metadata?.name
      log.push(`kubectl:delete:${name}`)
    }),
    rolloutStatus: vi.fn(),
    exec: vi.fn()
  }

  const buildRun = vi.fn(async (ctx: BuildContext) => {
    buildCalls.push(ctx)
    log.push(`build:${ctx.service.name}`)
  })

  const testRun = vi.fn(async (ctx: { git: GitInfo }) => {
    testCalls.push(ctx)
    log.push('test')
  })

  const deployRun = vi.fn(async (ctx: DeployContext) => {
    deployCalls.push({
      service: ctx.service.name,
      manifests: ctx.manifests,
      context: ctx
    })
    log.push(`deploy:${ctx.service.name}`)
    await ctx.kubectl.apply({
      context: ctx.environment.cluster.context,
      namespace: ctx.environment.namespace,
      manifests: ctx.manifests
    })
  })

  const diffRun = vi.fn(
    async (
      ctx: { manifests: RenderResult['manifests'] } & {
        kubectl: KubectlClient
        environment: DeployContext['environment']
      }
    ) => {
      diffCalls.push({ manifests: ctx.manifests })
      log.push(`diff:${ctx.environment.name}`)
      await ctx.kubectl.diff({
        context: ctx.environment.cluster.context,
        namespace: ctx.environment.namespace,
        manifests: ctx.manifests
      })
    }
  )

  const serviceManifests = (name: string) => ({
    manifests: ({ env, image }: { env: { namespace: string }; image: string }) => [
      {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: `${name}-config`,
          namespace: env.namespace
        },
        data: {
          image
        }
      }
    ]
  })

  const config: TsOpsConfig = {
    project: {
      name: 'tsops-test',
      repoUrl: 'https://example.invalid/tsops.git',
      defaultBranch: 'main'
    },
    environments: {
      local: {
        cluster: {
          apiServer: 'https://kubernetes.invalid',
          context: 'test'
        },
        namespace: 'tsops-test',
        imageTagStrategy: { type: 'gitSha', length: 7 }
      }
    },
    services: {
      api: {
        containerImage: 'example/api',
        defaultEnvironment: 'local',
        ...serviceManifests('api')
      },
      web: {
        containerImage: 'example/web',
        defaultEnvironment: 'local',
        dependsOn: ['api'],
        ...serviceManifests('web')
      }
    },
    pipeline: {
      build: {
        run: buildRun
      },
      test: {
        run: testRun
      },
      deploy: {
        run: deployRun,
        diff: diffRun
      }
    },
    secrets: {
      provider: { type: 'vault', connection: {} },
      map: {}
    },
    notifications: {
      channels: {},
      onEvents: {}
    }
  }

  const tsops = new TsOps(config, {
    exec: vi.fn(),
    kubectl,
    logger: noopLogger
  })

  return {
    tsops,
    config,
    buildCalls,
    testCalls,
    deployCalls,
    diffCalls,
    kubectl,
    log
  }
}

const extractManifestNames = (manifests: RenderResult['manifests']): string[] =>
  manifests.map((manifest) => (manifest as { metadata?: { name?: string } }).metadata?.name ?? '')

describe('TsOps core workflows', () => {
  it('runs build pipeline with expected context variables', async () => {
    const harness = createHarness()

    await harness.tsops.build('web', {
      environment: 'local',
      env: { EXTRA: '1' },
      git: gitInfo
    })

    expect(harness.buildCalls).toHaveLength(1)
    const ctx = harness.buildCalls[0]
    expect(ctx.service.name).toBe('web')
    expect(ctx.environment.name).toBe('local')
    expect(ctx.env).toMatchObject({
      SERVICE_NAME: 'web',
      ENVIRONMENT: 'local',
      EXTRA: '1'
    })
  })

  it('buildAll respects dependency ordering', async () => {
    const harness = createHarness()

    await harness.tsops.buildAll('local', { git: gitInfo })

    expect(harness.buildCalls.map((ctx) => ctx.service.name)).toEqual(['api', 'web'])
  })

  it('run orchestrates build, test, and deploy in order', async () => {
    const harness = createHarness()

    await harness.tsops.run('web', 'local', {
      git: gitInfo,
      env: { CI: '1' }
    })

    expect(harness.log).toEqual(['build:web', 'test', 'deploy:web', 'kubectl:apply:web-config'])
  })

  it('runAll executes all services with shared test stage', async () => {
    const harness = createHarness()

    await harness.tsops.runAll('local', { git: gitInfo })

    expect(harness.log.filter((entry) => entry.startsWith('build:'))).toEqual([
      'build:api',
      'build:web'
    ])
    expect(harness.log.filter((entry) => entry === 'test')).toEqual(['test'])
    expect(harness.log.filter((entry) => entry.startsWith('deploy:'))).toEqual([
      'deploy:api',
      'deploy:web'
    ])
  })

  it('render returns manifests and context for a service', async () => {
    const harness = createHarness()

    const result = await harness.tsops.render('api', 'local', { git: gitInfo })

    expect(result.imageTag).toBe(gitInfo.shortSha)
    expect(result.context.image).toBe(`example/api:${gitInfo.shortSha}`)
    expect(extractManifestNames(result.manifests)).toEqual(['api-config'])
  })

  it('renderAll aggregates manifests for all services in dependency order', async () => {
    const harness = createHarness()

    const results = await harness.tsops.renderAll('local', { git: gitInfo })

    expect(results.map((entry) => entry.service)).toEqual(['api', 'web'])
    expect(results.map((entry) => entry.context.image)).toEqual([
      `example/api:${gitInfo.shortSha}`,
      `example/web:${gitInfo.shortSha}`
    ])
  })

  it('deploy with diff triggers diff handler before deployment', async () => {
    const harness = createHarness()

    await harness.tsops.deploy('api', 'local', { diff: true, git: gitInfo })

    expect(harness.diffCalls).toHaveLength(1)
    expect(harness.kubectl.diff).toHaveBeenCalledTimes(1)
    expect(harness.kubectl.apply).toHaveBeenCalledTimes(1)
    expect(harness.log).toEqual([
      'diff:local',
      'kubectl:diff:api-config',
      'deploy:api',
      'kubectl:apply:api-config'
    ])
  })

  it('deployAll applies manifests for each service', async () => {
    const harness = createHarness()

    await harness.tsops.deployAll('local', { git: gitInfo })

    expect(harness.deployCalls.map((entry) => entry.service)).toEqual(['api', 'web'])
    expect(harness.kubectl.apply).toHaveBeenCalledTimes(2)
  })

  it('delete removes manifests for a single service', async () => {
    const harness = createHarness()

    await harness.tsops.delete('web', 'local', { git: gitInfo })

    expect(harness.kubectl.delete).toHaveBeenCalledTimes(1)
    const firstCall = harness.kubectl.delete.mock.calls[0][0]
    expect(extractManifestNames(firstCall.manifests)).toEqual(['web-config'])
  })

  it('deleteAll removes manifests in reverse dependency order', async () => {
    const harness = createHarness()

    await harness.tsops.deleteAll('local', { git: gitInfo })

    expect(harness.kubectl.delete).toHaveBeenCalledTimes(2)
    const names = harness.kubectl.delete.mock.calls.map(
      (call) => extractManifestNames(call[0].manifests)[0]
    )
    expect(names).toEqual(['web-config', 'api-config'])
  })
})
