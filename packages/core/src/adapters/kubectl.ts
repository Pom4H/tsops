import { CommandRunner } from '../command-runner.js'
import { Logger } from '../logger.js'
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

export type SupportedManifest =
  | NamespaceManifest
  | SecretManifest
  | ConfigMapManifest
  | DeploymentManifest
  | ServiceManifest
  | IngressManifest
  | IngressRouteManifest
  | CertificateManifest

export interface KubectlServiceOptions {
  runner: CommandRunner
  logger: Logger
  dryRun?: boolean
}

export interface ApplyManifestOptions {
  namespace: string
}

export class Kubectl {
  private readonly runner: CommandRunner
  private readonly logger: Logger
  private readonly dryRun: boolean

  constructor(options: KubectlServiceOptions) {
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
      this.logger.debug('Dry run enabled – skipping kubectl apply', { ref, namespace: options.namespace })
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

  /**
   * Apply multiple manifests atomically - either all succeed or all fail
   * @param manifests - Array of manifests to apply
   * @param options - Apply options
   * @returns Array of resource references (kind/name)
   */
  async applyBatch(manifests: SupportedManifest[], options: ApplyManifestOptions): Promise<string[]> {
    if (manifests.length === 0) {
      return []
    }

    const refs = manifests.map(m => {
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
      return refs.map(ref => `${ref} (dry-run)`)
    }

    // Combine all manifests into a single YAML document separated by ---
    // This ensures atomicity - kubectl will apply all or fail all
    const serialized = manifests
      .map(manifest => JSON.stringify(manifest))
      .join('\n---\n') + '\n'

    await this.runner.run('kubectl', ['apply', '-f', '-'], {
      inheritStdio: false,
      input: serialized,
      onStdout: (data) => this.logger.debug('kubectl stdout', { output: data.trim() }),
      onStderr: (data) => this.logger.warn('kubectl stderr', { output: data.trim() })
    })

    return refs
  }

  /**
   * Check if a secret exists in the cluster
   * @param secretName - Name of the secret
   * @param namespace - Namespace to check
   * @returns true if secret exists, false otherwise
   */
  async secretExists(secretName: string, namespace: string): Promise<boolean> {
    if (this.dryRun) {
      return false
    }

    try {
      await this.runner.run('kubectl', [
        'get',
        'secret',
        secretName,
        '-n',
        namespace,
        '--ignore-not-found'
      ], {
        inheritStdio: false
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Get secret data from cluster
   * @param secretName - Name of the secret
   * @param namespace - Namespace
   * @returns Secret data (decoded from base64) or null if not found
   */
  async getSecretData(secretName: string, namespace: string): Promise<Record<string, string> | null> {
    if (this.dryRun) {
      return null
    }

    try {
      const output = await this.runner.run('kubectl', [
        'get',
        'secret',
        secretName,
        '-n',
        namespace,
        '-o',
        'json'
      ], {
        inheritStdio: false,
        captureOutput: true
      })

      const secret = JSON.parse(output)
      const data: Record<string, string> = {}

      if (secret.data) {
        for (const [key, value] of Object.entries(secret.data)) {
          // Decode from base64
          data[key] = Buffer.from(value as string, 'base64').toString('utf-8')
        }
      }

      return data
    } catch {
      return null
    }
  }

  /**
   * Validate manifest using kubectl dry-run
   * @param manifest - Manifest to validate
   * @param options - Apply options
   * @param useClientSide - Use client-side validation instead of server-side (for namespaces that don't exist yet)
   * @returns true if valid, throws error if invalid
   */
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

    // For namespace-scoped resources, we need to specify the namespace
    const dryRunMode = useClientSide ? '--dry-run=client' : '--dry-run=server'
    const args = ['apply', dryRunMode, '-f', '-']
    if (kind !== 'Namespace') {
      args.push('-n', options.namespace)
    }

    try {
      await this.runner.run('kubectl', args, {
        inheritStdio: false,
        input: serialized,
        onStdout: (data) => this.logger.debug('kubectl stdout', { output: data.trim() }),
        onStderr: (data) => this.logger.debug('kubectl stderr', { output: data.trim() })
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

  /**
   * Get current state of a resource from cluster
   * @param kind - Resource kind (e.g., 'Deployment', 'Service')
   * @param name - Resource name
   * @param namespace - Namespace
   * @returns Resource manifest or null if not found
   */
  async get(kind: string, name: string, namespace: string): Promise<SupportedManifest | null> {
    if (this.dryRun) {
      return null
    }

    try {
      const output = await this.runner.run('kubectl', [
        'get',
        kind,
        name,
        '-n',
        namespace,
        '-o',
        'json'
      ], {
        inheritStdio: false,
        captureOutput: true
      })

      return JSON.parse(output) as SupportedManifest
    } catch {
      return null
    }
  }

  /**
   * Generate diff between desired manifest and current cluster state
   * @param manifest - Desired manifest
   * @param options - Apply options
   * @returns Diff output: empty string if no changes, diff text if changes, null if resource doesn't exist
   */
  async diff(manifest: SupportedManifest, options: ApplyManifestOptions): Promise<string | null> {
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

    // For namespace-scoped resources, we need to specify the namespace
    const args = ['diff', '-f', '-']
    if (kind !== 'Namespace') {
      args.push('-n', options.namespace)
    }

    // First check if resource exists
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
      
      // If output is empty, resource doesn't exist
      if (!existsOutput || existsOutput.trim() === '') {
        return null
      }
    } catch {
      // Resource doesn't exist
      return null
    }

    // Resource exists, now get the diff
    try {
      // kubectl diff returns exit code 1 when there are differences
      // and exit code 0 when there are no differences
      const output = await this.runner.run('kubectl', args, {
        inheritStdio: false,
        input: serialized,
        captureOutput: true,
        allowNonZeroExit: true
      })

      // Empty output means no differences
      return output || ''
    } catch (error) {
      // If diff command fails, assume no changes (resource exists but diff failed)
      this.logger.debug('kubectl diff failed, assuming no changes', {
        kind,
        name,
        error: error instanceof Error ? error.message : String(error)
      })
      return ''
    }
  }
}
