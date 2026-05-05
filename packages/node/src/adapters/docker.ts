import type { AppBuildContext, DockerfileBuild, Logger } from '@tsops/core'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, relative, resolve, sep } from 'node:path'
import globby from 'globby'
import type { Ignore } from 'ignore'
import type { CommandRunner } from '../command-runner.js'

export type DockerBuildContext = AppBuildContext

const require = createRequire(import.meta.url)
const createIgnore = require('ignore') as typeof import('ignore').default
const packageJson = require('../../package.json') as { version?: string }
const adapterVersion = packageJson.version ?? 'unknown'

export interface DockerServiceOptions {
  runner: CommandRunner
  logger: Logger
  dryRun?: boolean
}

export interface DockerLoginOptions {
  registry?: string
  username?: string
  password?: string
}

export class Docker {
  private readonly runner: CommandRunner
  private readonly logger: Logger
  private readonly dryRun: boolean
  private readonly loggedInRegistries: Set<string> = new Set()

  constructor(options: DockerServiceOptions) {
    this.runner = options.runner
    this.logger = options.logger
    this.dryRun = options.dryRun ?? false
  }

  /**
   * Login to Docker registry using credentials
   * Reads from environment variables: DOCKER_USERNAME, DOCKER_PASSWORD/DOCKER_TOKEN
   */
  async login(options: DockerLoginOptions = {}): Promise<void> {
    const registry = options.registry || process.env.DOCKER_REGISTRY || 'docker.io'
    const username = options.username || process.env.DOCKER_USERNAME
    const password = options.password || process.env.DOCKER_PASSWORD || process.env.DOCKER_TOKEN

    // Skip if already logged in to this registry
    if (this.loggedInRegistries.has(registry)) {
      this.logger.debug('Already logged in to registry', { registry })
      return
    }

    // Skip if no credentials provided
    if (!username || !password) {
      this.logger.debug('No Docker credentials found, skipping login', { registry })
      return
    }

    this.logger.info('Docker login', { registry, username })

    if (this.dryRun) {
      this.logger.debug('Dry run enabled – skipping docker login execution', { registry })
      this.loggedInRegistries.add(registry)
      return
    }

    try {
      // Use password-stdin for secure login
      await this.runner.run('docker', ['login', registry, '-u', username, '--password-stdin'], {
        input: password,
        inheritStdio: false,
        onStdout: (data) => this.logger.debug('docker stdout', { output: data.trim() }),
        onStderr: (data) => this.logger.warn('docker stderr', { output: data.trim() })
      })

      this.loggedInRegistries.add(registry)
      this.logger.info('Docker login successful', { registry })
    } catch (error) {
      this.logger.error('Docker login failed', { registry, error })
      throw error
    }
  }

  /**
   * Check if an image exists in the registry
   * Uses `docker manifest inspect` which queries the registry without pulling the image
   */
  async imageExists(imageRef: string): Promise<boolean> {
    this.logger.debug('Checking if image exists in registry', { imageRef })

    if (this.dryRun) {
      this.logger.debug('Dry run enabled – assuming image does not exist', { imageRef })
      return false
    }

    try {
      await this.runner.run('docker', ['manifest', 'inspect', imageRef], {
        inheritStdio: false,
        onStdout: (data) => this.logger.debug('docker manifest stdout', { output: data.trim() }),
        onStderr: (data) => this.logger.debug('docker manifest stderr', { output: data.trim() })
      })

      this.logger.debug('Image exists in registry', { imageRef })
      return true
    } catch (_error) {
      // If the command fails, the image doesn't exist
      this.logger.debug('Image does not exist in registry', { imageRef })
      return false
    }
  }

  async resolveDigest(imageRef: string): Promise<string | null> {
    this.logger.debug('Resolving image digest', { imageRef })

    if (this.dryRun) {
      this.logger.debug('Dry run enabled – skipping digest resolution', { imageRef })
      return null
    }

    try {
      const output = await this.runner.run(
        'docker',
        ['buildx', 'imagetools', 'inspect', imageRef, '--format', '{{json .Manifest.Digest}}'],
        {
          captureOutput: true,
          inheritStdio: false,
          onStdout: (data) =>
            this.logger.debug('docker imagetools stdout', { output: data.trim() }),
          onStderr: (data) => this.logger.debug('docker imagetools stderr', { output: data.trim() })
        }
      )
      const digest = output.trim().replace(/^"|"$/g, '')
      return /^sha256:[a-f0-9]{64}$/.test(digest) ? digest : null
    } catch (error) {
      this.logger.debug('Could not resolve image digest', {
        imageRef,
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  async sourceKey(
    appName: string,
    build: DockerfileBuild,
    ctx: DockerBuildContext
  ): Promise<string> {
    const sourceKey = build.sourceKey
    const custom = await resolveCustomSourceKey(sourceKey, ctx)
    const hash = createHash('sha256')
    hash.update('tsops-source-key-v1\0')
    hash.update(appName)
    hash.update('\0')
    hash.update('@tsops/node\0')
    hash.update(adapterVersion)
    hash.update('\0')

    if (custom !== undefined) {
      hash.update('custom\0')
      hash.update(custom)
      return hash.digest('hex')
    }

    const contextRoot = resolve(build.context)
    const patterns = resolveSourceKeyPatterns(build)
    const dockerIgnore = await readDockerIgnore(contextRoot)
    const files = await globby(patterns, {
      cwd: contextRoot,
      dot: true,
      onlyFiles: true,
      followSymbolicLinks: false,
      gitignore: false
    })
    const normalizedFiles = new Set<string>()
    for (const file of files) {
      const normalized = normalizePath(file)
      if (!dockerIgnore.ignores(normalized)) normalizedFiles.add(normalized)
    }

    for (const extra of await findExistingCommonInputs(contextRoot)) {
      if (!dockerIgnore.ignores(extra)) normalizedFiles.add(extra)
    }
    await addExistingInput(normalizedFiles, contextRoot, '.dockerignore')

    const dockerfile = normalizePath(relative(contextRoot, resolve(build.dockerfile)))
    if (dockerfile && !dockerIgnore.ignores(dockerfile)) normalizedFiles.add(dockerfile)

    hash.update(
      `${stableStringify({
        appName,
        args: build.args ?? {},
        cache: build.cache ?? null,
        context: normalizePath(build.context),
        dockerfile: normalizePath(build.dockerfile),
        env: build.env ?? {},
        inputs: build.inputs ?? null,
        platform:
          typeof build.platform === 'function' ? build.platform(ctx) : (build.platform ?? null),
        sourceKey: normalizeSourceKeyConfig(build.sourceKey),
        target: build.target ?? null
      })}\0`
    )

    for (const file of [...normalizedFiles].sort()) {
      hash.update(`file:${file}\0`)
      hash.update(await readFile(join(contextRoot, file)))
      hash.update('\0')
    }

    return hash.digest('hex')
  }

  async build(
    imageRef: string,
    build: DockerfileBuild,
    ctx: DockerBuildContext
  ): Promise<{ digest?: string; pushed?: boolean } | void> {
    if (!('type' in build) || build.type !== 'dockerfile') {
      this.logger.warn('Skipping unsupported build configuration. Expected type "dockerfile".', {
        imageRef
      })
      return
    }

    const usesBuildKitRegistryCache = build.cache?.type === 'registry'
    const args = usesBuildKitRegistryCache
      ? ([
          'buildx',
          'build',
          build.context,
          '--file',
          build.dockerfile,
          '--tag',
          imageRef
        ] as string[])
      : (['build', build.context, '--file', build.dockerfile, '--tag', imageRef] as string[])

    if (typeof build.platform === 'string') {
      args.push('--platform', build.platform)
    } else if (typeof build.platform === 'function') {
      const platform = build.platform(ctx)
      if (platform) {
        args.push('--platform', platform)
      }
    }

    appendKeyValue(args, build.args, '--build-arg')

    if (build.target) {
      args.push('--target', build.target)
    }

    if (usesBuildKitRegistryCache) {
      const cacheRef = build.cache?.ref ?? defaultRegistryCacheRef(imageRef)
      args.push(
        '--cache-from',
        `type=registry,ref=${cacheRef}`,
        '--cache-to',
        `type=registry,ref=${cacheRef},mode=${build.cache?.mode ?? 'max'}`,
        '--load'
      )
    }

    this.logger.info('Docker build', { imageRef })

    if (this.dryRun) {
      this.logger.debug('Dry run enabled – skipping docker build execution', { args })
      return
    }

    await this.runner.run('docker', args, {
      inheritStdio: true,
      env: build.env
    })
  }

  async push(imageRef: string): Promise<void> {
    this.logger.info('Docker push', { imageRef })

    if (this.dryRun) {
      this.logger.debug('Dry run enabled – skipping docker push execution', { imageRef })
      return
    }

    await this.runner.run('docker', ['push', imageRef], { inheritStdio: true })
  }
}

const commonInputFiles = [
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'turbo.json',
  'tsops.config.ts',
  'tsops.config.js',
  'tsops.config.mjs'
]

async function readDockerIgnore(contextRoot: string): Promise<Ignore> {
  const matcher = createIgnore()
  try {
    matcher.add(await readFile(join(contextRoot, '.dockerignore'), 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  return matcher
}

async function findExistingCommonInputs(contextRoot: string): Promise<string[]> {
  const existing: string[] = []
  for (const file of commonInputFiles) {
    try {
      await readFile(join(contextRoot, file))
      existing.push(file)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return existing
}

async function addExistingInput(
  files: Set<string>,
  contextRoot: string,
  file: string
): Promise<void> {
  try {
    await readFile(join(contextRoot, file))
    files.add(file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

async function resolveCustomSourceKey(
  sourceKey: DockerfileBuild['sourceKey'],
  ctx: DockerBuildContext
): Promise<string | undefined> {
  if (sourceKey === undefined || sourceKey === true || sourceKey === false) return undefined
  if (typeof sourceKey === 'string') return sourceKey
  if (typeof sourceKey === 'function') return sourceKey(ctx)
  if (sourceKey.mode === 'custom') {
    return typeof sourceKey.value === 'function' ? sourceKey.value(ctx) : sourceKey.value
  }
  return undefined
}

function resolveSourceKeyPatterns(build: DockerfileBuild): string[] {
  const sourceKey = build.sourceKey
  if (sourceKey && typeof sourceKey === 'object' && sourceKey.mode === 'inputs') {
    return [...sourceKey.inputs]
  }
  if (build.inputs && build.inputs.length > 0) return [...build.inputs]
  return ['**/*']
}

function normalizeSourceKeyConfig(sourceKey: DockerfileBuild['sourceKey']) {
  if (typeof sourceKey === 'function') return 'function'
  if (sourceKey && typeof sourceKey === 'object' && sourceKey.mode === 'custom') {
    return {
      mode: 'custom',
      value: typeof sourceKey.value === 'function' ? 'function' : sourceKey.value
    }
  }
  return sourceKey ?? null
}

function defaultRegistryCacheRef(imageRef: string): string {
  const tagSeparator = imageRef.lastIndexOf(':')
  const pathSeparator = imageRef.lastIndexOf('/')
  const repository = tagSeparator > pathSeparator ? imageRef.slice(0, tagSeparator) : imageRef
  return `${repository}:cache`
}

function normalizePath(input: string): string {
  return input.split(sep).join('/')
}

function stableStringify(input: unknown): string {
  if (Array.isArray(input)) return `[${input.map(stableStringify).join(',')}]`
  if (input && typeof input === 'object') {
    return `{${Object.entries(input as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${JSON.stringify(key)}:${stableStringify(value)}`)
      .join(',')}}`
  }
  return JSON.stringify(input)
}

function appendKeyValue(
  args: string[],
  values: Record<string, string> | undefined,
  flag: string
): void {
  if (!values) return
  for (const [key, value] of Object.entries(values)) {
    args.push(flag, `${key}=${value}`)
  }
}
