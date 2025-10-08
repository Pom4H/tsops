import type { DockerfileBuild, AppBuildContext } from '../types.js'

export interface DockerLoginOptions {
  registry?: string
  username?: string
  password?: string
}

export interface DockerClient {
  login(options?: DockerLoginOptions): Promise<void>
  build(imageRef: string, build: DockerfileBuild, ctx: AppBuildContext): Promise<void>
  push(imageRef: string): Promise<void>
}
