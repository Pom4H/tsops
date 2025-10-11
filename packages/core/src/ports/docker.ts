import type { AppBuildContext, DockerCacheConfig, DockerfileBuild } from '../types.js'

export interface DockerLoginOptions {
  registry?: string
  username?: string
  password?: string
}

export interface DockerClient {
  login(options?: DockerLoginOptions): Promise<void>
  imageExists(imageRef: string): Promise<boolean>
  build(
    imageRef: string,
    build: DockerfileBuild,
    ctx: AppBuildContext,
    cacheConfig?: DockerCacheConfig
  ): Promise<void>
  push(imageRef: string): Promise<void>
}
