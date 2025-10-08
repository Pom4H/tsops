import type {
  Logger,
  KubectlClient,
  SupportedManifest,
  ApplyManifestOptions
} from '@tsops/core'
import {
  CertificateManifest,
  ConfigMapManifest,
  DeploymentManifest,
  IngressManifest,
  IngressRouteManifest,
  NamespaceManifest,
  SecretManifest,
  ServiceManifest
} from '@tsops/k8'
import type { CommandRunner } from '../command-runner.js'

export class Kubectl implements KubectlClient {
  private readonly runner: CommandRunner
  private readonly logger: Logger
  private readonly dryRun: boolean

  constructor(options: { runner: CommandRunner; logger: Logger; dryRun?: boolean }) {
    this.runner = options.runner
    this.logger = options.logger
    this.dryRun = options.dryRun ?? false
  }

  async apply(manifest: SupportedManifest, options: ApplyManifestOptions): Promise<string> {
    const kind = String(manifest.kind ?? 'Unknown')
    const name = String(manifest.metadata?.name ?? 'unnamed')
    const ref = `${kind}/${name}`

    this.logger.info('kubectl apply', {
      namespace: options.namespace,
      kind,
      name
    })

    if (this.dryRun) {
      this.logger.debug('Dry run enabled – skipping kubectl apply', {
        ref,
        namespace: options.namespace
      })
      return `${ref} (dry-run)`
    }

    const serialized = `${JSON.stringify(manifest)}
`

    await this.runner.run('kubectl', ['apply', '-f', '-'], {
      inheritStdio: false,
      input: serialized,
      onStdout: (data) => this.logger.debug('kubectl stdout', { output: data.trim() }),
      onStderr: (data) => this.logger.warn('kubectl stderr', { output: data.trim() })
    })

    return ref
  }

  async applyBatch(
    manifests: SupportedManifest[],
    options: ApplyManifestOptions
  ): Promise<string[]> {
    if (manifests.length === 0) {
      return []
    }

    const refs = manifests.map((m) => {
      const kind = String(m.kind ?? 'Unknown')
      const name = String(m.metadata?.name ?? 'unnamed')
      return `${kind}/${name}`
    })

    this.logger.info('kubectl apply batch', {
      namespace: options.namespace,
      count: manifests.length,
      resources: refs
    })

    if (this.dryRun) {
      this.logger.debug('Dry run enabled – skipping kubectl apply batch', {
        refs,
        namespace: options.namespace
      })
      return refs.map((ref) => `${ref} (dry-run)`)
    }

    const serialized =
      manifests.map((manifest) => JSON.stringify(manifest)).join('\n---\n') + '\n'

    await this.runner.run('kubectl', ['apply', '-f', '-'], {
      inheritStdio: false,
      input: serialized,
      onStdout: (data) => this.logger.debug('kubectl stdout', { output: data.trim() }),
      onStderr: (data) => this.logger.warn('kubectl stderr', { output: data.trim() })
    })

    return refs
  }

  async secretExists(secretName: string, namespace: string): Promise<boolean> {
    if (this.dryRun) {
      return false
    }

    try {
      await this.runner.run(
        'kubectl',
        ['get', 'secret', secretName, '-n', namespace, '--ignore-not-found'],
        {
          inheritStdio: false
        }
      )
      return true
    } catch {
      return false
    }
  }

  async getSecretData(
    secretName: string,
    namespace: string
  ): Promise<Record<string, string> | null> {
    if (this.dryRun) {
      return null
    }

    try {
      const output = await this.runner.run(
        'kubectl',
        ['get', 'secret', secretName, '-n', namespace, '-o', 'json'],
        {
          inheritStdio: false,
          captureOutput: true
        }
      )

      const secret = JSON.parse(output)
      const data: Record<string, string> = {}

      if (secret.data) {
        for (const [key, value] of Object.entries(secret.data)) {
          data[key] = Buffer.from(value as string, 'base64').toString('utf-8')
        }
      }

      return data
    } catch {
      return null
    }
  }

  async validate(
    manifest: SupportedManifest,
    options: ApplyManifestOptions,
    useClientSide: boolean = false
  ): Promise<boolean> {
    const kind = String(manifest.kind ?? 'Unknown')
    const name = String(manifest.metadata?.name ?? 'unnamed')

    this.logger.info('kubectl validate', {
      namespace: options.namespace,
      kind,
      name,
      mode: useClientSide ? 'client' : 'server'
    })

    const serialized = `${JSON.stringify(manifest)}
`

    const dryRunMode = useClientSide ? '--dry-run=client' : '--dry-run=server'
    const args = ['apply', dryRunMode, '-f', '-']
    if (kind !== 'Namespace') {
      args.push('-n', options.namespace)
    }

    try {
      await this.runner.run('kubectl', args, {
        inheritStdio: false,
        input: serialized,
        onStdout: (data) =>
          this.logger.debug('kubectl stdout', { output: data.trim() }),
        onStderr: (data) =>
          this.logger.debug('kubectl stderr', { output: data.trim() })
      })
      return true
    } catch (error) {
      this.logger.error('Manifest validation failed', {
        kind,
        name,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  async get(
    kind: string,
    name: string,
    namespace: string
  ): Promise<SupportedManifest | null> {
    if (this.dryRun) {
      return null
    }

    try {
      const output = await this.runner.run(
        'kubectl',
        ['get', kind, name, '-n', namespace, '-o', 'json'],
        {
          inheritStdio: false,
          captureOutput: true
        }
      )

      return JSON.parse(output) as SupportedManifest
    } catch {
      return null
    }
  }

  async diff(
    manifest: SupportedManifest,
    options: ApplyManifestOptions
  ): Promise<string | null> {
    const kind = String(manifest.kind ?? 'Unknown')
    const name = String(manifest.metadata?.name ?? 'unnamed')

    this.logger.debug('kubectl diff', {
      namespace: options.namespace,
      kind,
      name
    })

    if (this.dryRun) {
      return '(dry-run - diff not available)'
    }

    const serialized = `${JSON.stringify(manifest)}
`

    const args = ['diff', '-f', '-']
    if (kind !== 'Namespace') {
      args.push('-n', options.namespace)
    }

    try {
      const getArgs = ['get', kind, name]
      if (kind !== 'Namespace') {
        getArgs.push('-n', options.namespace)
      }
      getArgs.push('--ignore-not-found')

      const existsOutput = await this.runner.run('kubectl', getArgs, {
        inheritStdio: false,
        captureOutput: true
      })

      if (!existsOutput || existsOutput.trim() === '') {
        return null
      }
    } catch {
      return null
    }

    try {
      const output = await this.runner.run('kubectl', args, {
        inheritStdio: false,
        input: serialized,
        captureOutput: true,
        allowNonZeroExit: true
      })

      return output || ''
    } catch (error) {
      this.logger.debug('kubectl diff failed, assuming no changes', {
        kind,
        name,
        error: error instanceof Error ? error.message : String(error)
      })
      return ''
    }
  }

  async list(
    kind: string,
    namespace: string,
    labelSelector?: string
  ): Promise<SupportedManifest[]> {
    if (this.dryRun) {
      return []
    }

    try {
      const args = ['get', kind, '-n', namespace, '-o', 'json']
      if (labelSelector) {
        args.push('-l', labelSelector)
      }

      const output = await this.runner.run('kubectl', args, {
        inheritStdio: false,
        captureOutput: true
      })

      const result = JSON.parse(output)
      return result.items || []
    } catch {
      return []
    }
  }

  async delete(kind: string, name: string, namespace: string): Promise<string> {
    const ref = `${kind}/${name}`

    this.logger.info('kubectl delete', {
      namespace,
      kind,
      name
    })

    if (this.dryRun) {
      this.logger.debug('Dry run enabled – skipping kubectl delete', { ref, namespace })
      return `${ref} (dry-run)`
    }

    await this.runner.run('kubectl', ['delete', kind, name, '-n', namespace], {
      inheritStdio: false,
      onStdout: (data) => this.logger.debug('kubectl stdout', { output: data.trim() }),
      onStderr: (data) => this.logger.warn('kubectl stderr', { output: data.trim() })
    })

    return ref
  }
}

export type {
  NamespaceManifest,
  SecretManifest,
  ConfigMapManifest,
  DeploymentManifest,
  ServiceManifest,
  IngressManifest,
  IngressRouteManifest,
  CertificateManifest
}
