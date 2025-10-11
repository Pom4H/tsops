import type { AppBuildContext, DockerCacheConfig, DockerfileBuild, Logger } from '@tsops/core'
import type { CommandRunner } from '../command-runner.js'

export type DockerBuildContext = AppBuildContext

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

  async build(
    imageRef: string,
    build: DockerfileBuild,
    ctx: DockerBuildContext,
    cacheConfig?: DockerCacheConfig
  ): Promise<void> {
    if (!('type' in build) || build.type !== 'dockerfile') {
      this.logger.warn('Skipping unsupported build configuration. Expected type "dockerfile".', {
        imageRef
      })
      return
    }

    const args = ['build', build.context, '--file', build.dockerfile, '--tag', imageRef] as string[]

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

    // Apply cache configuration
    const effectiveCache = build.cache === false ? undefined : (build.cache ?? cacheConfig)
    if (effectiveCache) {
      this.applyCacheConfig(args, imageRef, effectiveCache)
    }

    this.logger.info('Docker build', { imageRef, cache: effectiveCache?.type })

    if (this.dryRun) {
      this.logger.debug('Dry run enabled – skipping docker build execution', { args })
      return
    }

    await this.runner.run('docker', args, {
      inheritStdio: true,
      env: build.env
    })
  }

  /**
   * Apply Docker BuildKit cache configuration to build arguments
   * @see https://docs.docker.com/build/cache/backends/
   */
  private applyCacheConfig(args: string[], imageRef: string, cache: DockerCacheConfig): void {
    switch (cache.type) {
      case 'registry': {
        const cacheRef = cache.ref ?? `${imageRef}-cache`
        args.push('--cache-from', `type=registry,ref=${cacheRef}`)

        // Build cache export config
        const exportParts = [`type=registry`, `ref=${cacheRef}`]
        if (cache.mode) {
          exportParts.push(`mode=${cache.mode}`)
        }
        args.push('--cache-to', exportParts.join(','))

        // Enable inline cache for better layer reuse
        if (cache.inline) {
          args.push('--build-arg', 'BUILDKIT_INLINE_CACHE=1')
        }
        break
      }

      case 'gha': {
        // GitHub Actions cache
        const cacheFromParts = ['type=gha']
        if (cache.scope) {
          cacheFromParts.push(`scope=${cache.scope}`)
        }
        args.push('--cache-from', cacheFromParts.join(','))

        const cacheToParts = ['type=gha']
        if (cache.scope) {
          cacheToParts.push(`scope=${cache.scope}`)
        }
        cacheToParts.push('mode=max') // Always use max mode for GHA
        args.push('--cache-to', cacheToParts.join(','))
        break
      }

      case 's3': {
        const cacheFromParts = ['type=s3', `bucket=${cache.bucket}`]
        if (cache.region) {
          cacheFromParts.push(`region=${cache.region}`)
        }
        if (cache.prefix) {
          cacheFromParts.push(`prefix=${cache.prefix}`)
        }
        args.push('--cache-from', cacheFromParts.join(','))

        const cacheToParts = ['type=s3', `bucket=${cache.bucket}`, 'mode=max']
        if (cache.region) {
          cacheToParts.push(`region=${cache.region}`)
        }
        if (cache.prefix) {
          cacheToParts.push(`prefix=${cache.prefix}`)
        }
        args.push('--cache-to', cacheToParts.join(','))
        break
      }

      case 'local': {
        const dest = cache.dest ?? './buildkit-cache'
        args.push('--cache-from', `type=local,src=${dest}`)
        args.push('--cache-to', `type=local,dest=${dest},mode=max`)
        break
      }

      case 'inline': {
        // Inline cache embeds cache metadata into the image
        args.push('--build-arg', 'BUILDKIT_INLINE_CACHE=1')
        args.push('--cache-from', imageRef)
        break
      }

      default:
        this.logger.warn('Unknown cache type, skipping cache configuration', { cache })
    }
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
