import type { ConfigResolver } from '../config/resolver.js'
import type { Logger } from '../logger.js'
import type { DockerClient } from '../ports/docker.js'
import type { BuildDefinition, DockerfileBuild, TsOpsConfig } from '../types.js'
import type { BuildResult } from './types.js'

interface BuilderDependencies<TConfig extends TsOpsConfig<any, any, any, any, any, any>> {
  docker: DockerClient
  logger: Logger
  dryRun: boolean
  resolver: ConfigResolver<TConfig>
}

export class Builder<TConfig extends TsOpsConfig<any, any, any, any, any, any>> {
  private readonly docker: DockerClient
  private readonly logger: Logger
  private readonly dryRun: boolean
  private readonly resolver: ConfigResolver<TConfig>

  constructor(dependencies: BuilderDependencies<TConfig>) {
    this.docker = dependencies.docker
    this.logger = dependencies.logger
    this.dryRun = dependencies.dryRun
    this.resolver = dependencies.resolver
  }

  async build(
    options: {
      app?: string
      namespace?: string
      force?: boolean
      changedFiles?: string[]
      sourceKey?: boolean
    } = {}
  ): Promise<BuildResult> {
    // Login to Docker registry before building (reads from env vars)
    await this.docker.login()

    // Determine which apps to build
    let apps: ReturnType<typeof this.resolver.apps.select>

    if (options.changedFiles && options.changedFiles.length > 0) {
      // Filter by changed files (incremental build)
      apps = this.resolver.apps.selectByChangedFiles(options.changedFiles)

      if (apps.length === 0) {
        this.logger.info('No apps affected by changed files. Skipping build.')
        return { images: [] }
      }

      this.logger.info(
        `Building ${apps.length} affected app(s): ${apps.map(([name]) => name).join(', ')}`
      )
    } else if (options.app) {
      // Filter by specific app name
      apps = this.resolver.apps.select(options.app)
    } else {
      // Build all apps
      apps = this.resolver.apps.select()
    }

    const results: BuildResult['images'] = []

    for (const [appName, app] of apps) {
      const build = app.build

      if (!build) {
        this.logger.warn('No build configuration found. Skipping.', { app: appName })
        continue
      }

      let imageRef = this.resolver.images.buildRef(appName)
      let sourceKey: string | undefined
      if (!isDockerfileBuild(build)) {
        this.logger.warn('Skipping unsupported build configuration. Expected type "dockerfile".', {
          app: appName
        })
        continue
      }

      if (shouldUseSourceKey(build, options.sourceKey)) {
        if (!this.docker.sourceKey) {
          throw new Error(
            `Docker adapter does not support source-key image reuse for app "${appName}"`
          )
        }
        sourceKey = normalizeSourceKey(await this.docker.sourceKey(appName, build, {}), appName)
        imageRef = this.resolver.images.buildRef(appName, { tag: `source-${sourceKey}` })
      }

      // Check if image already exists in registry (unless force rebuild is requested)
      if (!options.force) {
        const exists = await this.docker.imageExists(imageRef)
        if (exists) {
          const digest = await this.resolveDigest(imageRef)
          this.logger.info('Image already exists in registry. Skipping build.', {
            app: appName,
            image: imageRef
          })
          results.push({
            app: appName,
            image: toDeployImageRef(imageRef, digest),
            tag: imageRef,
            digest,
            sourceKey,
            reused: true
          })
          continue
        }
      } else {
        this.logger.info('Force rebuild requested. Building image.', {
          app: appName,
          image: imageRef
        })
      }

      // Build context can be extended with namespace variables if needed
      const buildResult = await this.docker.build(imageRef, build, {})
      if (!this.dryRun && !buildResult?.pushed) {
        await this.docker.push(imageRef)
      }
      const digest = buildResult?.digest ?? (await this.resolveDigest(imageRef))
      results.push({
        app: appName,
        image: toDeployImageRef(imageRef, digest),
        tag: imageRef,
        digest,
        sourceKey,
        reused: false
      })
    }

    return { images: results }
  }

  private async resolveDigest(imageRef: string): Promise<string | undefined> {
    if (!this.docker.resolveDigest) return undefined
    const digest = await this.docker.resolveDigest(imageRef)
    return digest ?? undefined
  }
}

function isDockerfileBuild(build: BuildDefinition): build is DockerfileBuild {
  if (typeof build !== 'object' || build === null) return false

  const candidate = build as Partial<DockerfileBuild>
  return (
    candidate.type === 'dockerfile' &&
    typeof candidate.context === 'string' &&
    typeof candidate.dockerfile === 'string'
  )
}

function shouldUseSourceKey(build: DockerfileBuild, option?: boolean): boolean {
  if (build.sourceKey === false) return false
  if (option) return true
  if (build.inputs && build.inputs.length > 0) return true
  return build.sourceKey !== undefined
}

function normalizeSourceKey(sourceKey: string, appName: string): string {
  const normalized = sourceKey
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 100)
  if (!normalized) throw new Error(`Invalid empty source key for app "${appName}"`)
  return normalized
}

function toDeployImageRef(imageRef: string, digest: string | undefined): string {
  if (!digest) return imageRef
  if (imageRef.includes('@')) return imageRef
  const tagSeparator = imageRef.lastIndexOf(':')
  const pathSeparator = imageRef.lastIndexOf('/')
  const repository = tagSeparator > pathSeparator ? imageRef.slice(0, tagSeparator) : imageRef
  return `${repository}@${digest}`
}
