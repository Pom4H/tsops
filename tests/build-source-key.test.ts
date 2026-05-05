import {
  NullEnvironmentProvider,
  TsOps,
  defineConfig,
  type DockerClient,
  type DockerfileBuild
} from '@tsops/core'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Docker } from '@tsops/node'
import { describe, expect, it } from 'vitest'

const digest = `sha256:${'a'.repeat(64)}`
const digestRef = `ghcr.io/acme/api@${digest}`

describe('source-key image reuse', () => {
  it('reuses an existing source-key image and returns an immutable digest ref', async () => {
    const docker = new RecordingDocker({
      sourceKey: 'feedface',
      existingImages: new Set(['ghcr.io/acme/api:source-feedface']),
      digests: new Map([['ghcr.io/acme/api:source-feedface', digest]])
    })

    const tsops = makeTsOps(docker)
    const result = await tsops.build({ app: 'api' })

    expect(docker.sourceKeyCalls).toEqual([
      {
        app: 'api',
        inputs: ['apps/api/**', 'packages/shared/**']
      }
    ])
    expect(docker.imageExistsCalls).toEqual(['ghcr.io/acme/api:source-feedface'])
    expect(docker.buildCalls).toHaveLength(0)
    expect(docker.pushCalls).toHaveLength(0)
    expect(result.images).toEqual([
      {
        app: 'api',
        image: digestRef,
        tag: 'ghcr.io/acme/api:source-feedface',
        digest,
        sourceKey: 'feedface',
        reused: true
      }
    ])
  })

  it('builds the source-key tag, pushes it, and resolves the digest when no reuse exists', async () => {
    const docker = new RecordingDocker({
      sourceKey: 'cafebabe',
      existingImages: new Set(),
      digests: new Map([['ghcr.io/acme/api:source-cafebabe', digest]])
    })

    const tsops = makeTsOps(docker)
    const result = await tsops.build({ app: 'api' })

    expect(docker.imageExistsCalls).toEqual(['ghcr.io/acme/api:source-cafebabe'])
    expect(docker.buildCalls).toEqual(['ghcr.io/acme/api:source-cafebabe'])
    expect(docker.pushCalls).toEqual(['ghcr.io/acme/api:source-cafebabe'])
    expect(result.images[0]).toMatchObject({
      image: digestRef,
      tag: 'ghcr.io/acme/api:source-cafebabe',
      digest,
      sourceKey: 'cafebabe',
      reused: false
    })
  })
})

describe('Node Docker source-key computation', () => {
  it('hashes explicit build.inputs and always includes Dockerfile and build metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tsops-source-key-'))
    await writeFile(join(root, 'Dockerfile'), 'FROM scratch\n')
    await writeFile(join(root, 'ignored.txt'), 'ignored v1\n')
    await writeFile(join(root, 'package.json'), '{"name":"fixture"}\n')
    await writeFile(join(root, 'app.ts'), 'console.log("v1")\n')

    const docker = new Docker({
      runner: { run: async () => '' },
      logger: silentLogger,
      dryRun: true
    })

    const build: DockerfileBuild = {
      type: 'dockerfile',
      context: root,
      dockerfile: join(root, 'Dockerfile'),
      inputs: ['app.ts'],
      args: { NODE_ENV: 'production' }
    }

    const first = await docker.sourceKey('api', build, {})
    await writeFile(join(root, 'ignored.txt'), 'ignored v2\n')
    const afterUnrelatedChange = await docker.sourceKey('api', build, {})
    await writeFile(join(root, 'app.ts'), 'console.log("v2")\n')
    const afterInputChange = await docker.sourceKey('api', build, {})
    const afterArgChange = await docker.sourceKey(
      'api',
      {
        ...build,
        args: { NODE_ENV: 'development' }
      },
      {}
    )

    expect(afterUnrelatedChange).toBe(first)
    expect(afterInputChange).not.toBe(first)
    expect(afterArgChange).not.toBe(afterInputChange)
  })

  it('uses build.context as the default source-key mode and respects .dockerignore', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tsops-context-key-'))
    await writeFile(join(root, 'Dockerfile'), 'FROM scratch\n')
    await writeFile(join(root, '.dockerignore'), 'ignored.txt\n')
    await writeFile(join(root, 'ignored.txt'), 'ignored v1\n')
    await writeFile(join(root, 'app.ts'), 'console.log("v1")\n')

    const docker = new Docker({
      runner: { run: async () => '' },
      logger: silentLogger,
      dryRun: true
    })
    const build: DockerfileBuild = {
      type: 'dockerfile',
      context: root,
      dockerfile: join(root, 'Dockerfile'),
      sourceKey: true
    }

    const first = await docker.sourceKey('api', build, {})
    await writeFile(join(root, 'ignored.txt'), 'ignored v2\n')
    const afterIgnoredChange = await docker.sourceKey('api', build, {})
    await writeFile(join(root, 'app.ts'), 'console.log("v2")\n')
    const afterIncludedChange = await docker.sourceKey('api', build, {})

    expect(afterIgnoredChange).toBe(first)
    expect(afterIncludedChange).not.toBe(first)
  })

  it('resolves a repo-relative Dockerfile path under the build context', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tsops-repo-key-'))
    const previousCwd = process.cwd()
    await mkdir(join(root, 'examples/monorepo/apps/backend'), { recursive: true })
    await writeFile(join(root, 'examples/monorepo/apps/backend/Dockerfile'), 'FROM scratch\n')
    await writeFile(join(root, 'examples/monorepo/apps/backend/index.ts'), 'console.log("v1")\n')

    const docker = new Docker({
      runner: { run: async () => '' },
      logger: silentLogger,
      dryRun: true
    })
    const build: DockerfileBuild = {
      type: 'dockerfile',
      context: 'examples/monorepo',
      dockerfile: 'examples/monorepo/apps/backend/Dockerfile',
      inputs: ['apps/backend/**']
    }

    process.chdir(root)
    try {
      await expect(docker.sourceKey('backend', build, {})).resolves.toMatch(/^[a-f0-9]{64}$/)
    } finally {
      process.chdir(previousCwd)
    }
  })

  it('uses BuildKit registry cache flags when DockerfileBuild.cache opts in', async () => {
    const calls: Array<{ command: string; args: string[] }> = []
    const docker = new Docker({
      runner: {
        run: async (command, args) => {
          calls.push({ command, args })
          return ''
        }
      },
      logger: silentLogger
    })

    await docker.build(
      'ghcr.io/acme/api:source-feedface',
      {
        type: 'dockerfile',
        context: '.',
        dockerfile: 'Dockerfile',
        cache: { type: 'registry', mode: 'max' }
      },
      {}
    )

    expect(calls).toEqual([
      {
        command: 'docker',
        args: expect.arrayContaining([
          'buildx',
          'build',
          '--cache-from',
          'type=registry,ref=ghcr.io/acme/api:cache',
          '--cache-to',
          'type=registry,ref=ghcr.io/acme/api:cache,mode=max',
          '--load'
        ])
      }
    ])
  })
})

describe('digest image overrides', () => {
  it('overrides planned app images with immutable digest refs', async () => {
    const docker = new RecordingDocker()
    const tsops = makeTsOps(docker)

    const plan = await tsops.plan({
      namespace: 'prod',
      imageOverrides: { api: digestRef }
    })

    expect(plan.entries).toMatchObject([{ app: 'api', image: digestRef }])
  })

  it('rejects unknown or mutable image overrides', async () => {
    const docker = new RecordingDocker()
    const tsops = makeTsOps(docker)

    await expect(
      tsops.plan({
        namespace: 'prod',
        imageOverrides: { missing: digestRef }
      })
    ).rejects.toThrow('Unknown image override app "missing"')

    await expect(
      tsops.plan({
        namespace: 'prod',
        imageOverrides: { api: 'ghcr.io/acme/api:mutable' }
      })
    ).rejects.toThrow('must be an immutable digest ref')
  })
})

function makeTsOps(docker: DockerClient) {
  const config = defineConfig({
    project: 'demo',
    namespaces: {
      prod: { domain: 'example.com' }
    },
    clusters: {
      prod: {
        apiServer: 'https://example.invalid',
        context: 'prod',
        namespaces: ['prod']
      }
    },
    images: {
      registry: 'ghcr.io/acme',
      tagStrategy: 'git-sha'
    },
    apps: {
      api: {
        build: {
          type: 'dockerfile',
          context: '.',
          dockerfile: 'Dockerfile',
          inputs: ['apps/api/**', 'packages/shared/**']
        },
        ports: [{ name: 'http', port: 80, targetPort: 3000 }]
      }
    }
  })

  return new TsOps(config, {
    docker,
    kubectl: noopKubectl,
    env: new NullEnvironmentProvider()
  })
}

class RecordingDocker implements DockerClient {
  sourceKeyCalls: Array<{ app: string; inputs?: readonly string[] }> = []
  imageExistsCalls: string[] = []
  buildCalls: string[] = []
  pushCalls: string[] = []

  constructor(
    private readonly options: {
      sourceKey?: string
      existingImages?: Set<string>
      digests?: Map<string, string>
    } = {}
  ) {}

  async login() {}

  async sourceKey(appName: string, build: DockerfileBuild) {
    this.sourceKeyCalls.push({ app: appName, inputs: build.inputs })
    return this.options.sourceKey ?? 'source'
  }

  async imageExists(imageRef: string) {
    this.imageExistsCalls.push(imageRef)
    return this.options.existingImages?.has(imageRef) ?? false
  }

  async resolveDigest(imageRef: string) {
    return this.options.digests?.get(imageRef) ?? null
  }

  async build(imageRef: string) {
    this.buildCalls.push(imageRef)
  }

  async push(imageRef: string) {
    this.pushCalls.push(imageRef)
  }
}

const noopKubectl = {
  apply: async () => '',
  applyBatch: async () => [],
  validate: async () => true,
  diff: async () => null,
  get: async () => null,
  getSecretData: async () => null,
  listManagedResources: async () => [],
  delete: async () => '',
  waitForJob: async () => {}
} as any

const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {}
}
