import { Buffer } from 'node:buffer'

import type { Logger, SecretDeleteOptions, SecretReadResult, SecretWriteOptions } from '../types.js'
import type { CommandRunOptions } from './command-executor.js'

interface ExecutorLike {
  run(command: string, options?: CommandRunOptions): Promise<void>
  capture(command: string, options?: CommandRunOptions): Promise<{ stdout: string; stderr: string }>
}

export interface SecretReference {
  context: string
  namespace: string
  name: string
}

export interface SecretWriteInput extends SecretReference {
  data: Record<string, string>
  options?: SecretWriteOptions
}

export interface SecretDeleteInput extends SecretReference {
  options?: SecretDeleteOptions
}

export class SecretManager {
  private readonly executor: ExecutorLike
  private readonly logger: Logger

  constructor(executor: ExecutorLike, logger: Logger) {
    this.executor = executor
    this.logger = logger
  }

  async upsertSecret({ context, namespace, name, data, options }: SecretWriteInput): Promise<void> {
    const manifest = this.buildSecretManifest({ context, namespace, name, data, options })
    const command = `kubectl --context ${context} --namespace ${namespace} apply -f -`

    await this.executor.run(command, { input: manifest })

    this.logger.debug?.(`Applied secret "${name}" in namespace "${namespace}"`)
  }

  async readSecret({ context, namespace, name }: SecretReference): Promise<SecretReadResult> {
    const command = `kubectl --context ${context} --namespace ${namespace} get secret ${name} -o json`

    const result = await this.executor.capture(command)
    if (!result.stdout) {
      throw new Error(`kubectl returned no output while reading secret "${name}"`)
    }

    const parsed = JSON.parse(result.stdout) as {
      type?: string
      data?: Record<string, string>
      metadata?: { labels?: Record<string, string>; annotations?: Record<string, string> }
    }

    const data = this.decodeSecretData(parsed.data ?? {})
    const type = parsed.type ?? 'Opaque'

    return {
      type,
      data,
      metadata: {
        labels: parsed.metadata?.labels,
        annotations: parsed.metadata?.annotations
      }
    }
  }

  async deleteSecret({ context, namespace, name, options }: SecretDeleteInput): Promise<void> {
    const extra = options?.ignoreNotFound ? ' --ignore-not-found' : ''
    const command = `kubectl --context ${context} --namespace ${namespace} delete secret ${name}${extra}`
    await this.executor.run(command)

    this.logger.debug?.(`Deleted secret "${name}" in namespace "${namespace}"`)
  }

  private buildSecretManifest(input: SecretWriteInput): string {
    const { name, namespace, data, options } = input

    const metadata: Record<string, unknown> = {
      name,
      namespace
    }

    if (options?.labels && Object.keys(options.labels).length > 0) {
      metadata.labels = options.labels
    }
    if (options?.annotations && Object.keys(options.annotations).length > 0) {
      metadata.annotations = options.annotations
    }

    const manifest = {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata,
      type: options?.type ?? 'Opaque',
      stringData: data
    }

    return JSON.stringify(manifest, null, 2)
  }

  private decodeSecretData(data: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(data)) {
      try {
        result[key] = Buffer.from(value, 'base64').toString('utf8')
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        this.logger.warn(
          `Failed to decode secret value for key "${key}"; returning raw base64 string. (${reason})`
        )
        result[key] = value
      }
    }
    return result
  }
}
