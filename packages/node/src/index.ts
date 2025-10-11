export * from './adapters/docker.js'
export * from './adapters/git.js'
export * from './adapters/kubectl.js'
export * from './command-runner.js'
export * from './environment.js'

import {
  ConsoleLogger,
  type EnvironmentProvider,
  type Logger,
  TsOps,
  type TsOpsConfig
} from '@tsops/core'
import { Docker } from './adapters/docker.js'
import { GitEnvironmentProvider } from './adapters/git.js'
import { Kubectl } from './adapters/kubectl.js'
import type { CommandRunner } from './command-runner.js'
import { DefaultCommandRunner } from './command-runner.js'
import { ProcessEnvironmentProvider } from './environment.js'

export interface NodeTsOpsOptions {
  dryRun?: boolean
  runner?: CommandRunner
  logger?: Logger
  env?: EnvironmentProvider
  docker?: Docker
  kubectl?: Kubectl
}

export function createNodeTsOps<TConfig extends TsOpsConfig<any, any, any, any, any, any, any>>(
  config: TConfig,
  options: NodeTsOpsOptions = {}
): TsOps<TConfig> {
  const dryRun = options.dryRun ?? false
  const runner = options.runner ?? new DefaultCommandRunner()
  const logger = options.logger ?? new ConsoleLogger()
  const env = options.env ?? new GitEnvironmentProvider(new ProcessEnvironmentProvider())
  const docker =
    options.docker ??
    new Docker({
      runner,
      logger,
      dryRun
    })
  const kubectl =
    options.kubectl ??
    new Kubectl({
      runner,
      logger,
      dryRun
    })

  return new TsOps(config, {
    docker,
    kubectl,
    logger,
    env,
    dryRun
  })
}
