import type { EnvironmentProvider } from '@tsops/core'

export class ProcessEnvironmentProvider implements EnvironmentProvider {
  get(key: string): string | undefined {
    return process.env[key]
  }
}
