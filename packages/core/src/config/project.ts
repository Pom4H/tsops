import type { TsOpsConfig } from '../types.js'

export interface ProjectResolver<
  TConfig extends TsOpsConfig<any, any, any, any, any, any>
> {
  readonly name: TConfig['project']
  serviceName(appName: string): string
}

export function createProjectResolver<
  TConfig extends TsOpsConfig<any, any, any, any, any, any>
>(config: TConfig): ProjectResolver<TConfig> {
  const name = config.project

  return {
    name,
    serviceName(appName: string): string {
      return appName
    }
  }
}
