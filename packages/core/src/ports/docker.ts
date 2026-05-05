import type { AppBuildContext, DockerfileBuild } from '../types.js'

export interface DockerLoginOptions {
  registry?: string
  username?: string
  password?: string
}

export interface DockerClient {
  login(options?: DockerLoginOptions): Promise<void>
  sourceKey?(appName: string, build: DockerfileBuild, ctx: AppBuildContext): Promise<string>
  imageExists(imageRef: string): Promise<boolean>
  resolveDigest?(imageRef: string): Promise<string | null>
  build(
    imageRef: string,
    build: DockerfileBuild,
    ctx: AppBuildContext
  ): Promise<{ digest?: string; pushed?: boolean } | void>
  push(imageRef: string): Promise<void>
}
