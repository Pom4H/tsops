import type { ManifestBuilder } from '@tsops/k8'
import { buildNamespace, buildSecret, buildConfigMap } from '@tsops/k8'
import type { TsOpsConfig } from '../types.js'
import type { DeployResult, PlanWithChangesResult, ManifestChange, AppResourceChanges } from './types.js'
import { Planner } from './planner.js'
import { Kubectl, type SupportedManifest } from '../adapters/kubectl.js'
import type { ConfigResolver } from '../config/resolver.js'
import type { Logger } from '../logger.js'

interface DeployerDependencies<TConfig extends TsOpsConfig<any, any, any, any, any, any>> {
  manifestBuilder: ManifestBuilder<TConfig>
  planner: Planner<TConfig>
  kubectl: Kubectl
  resolver: ConfigResolver<TConfig>
  logger: Logger
}

export class Deployer<TConfig extends TsOpsConfig<any, any, any, any, any, any>> {
  private readonly manifestBuilder: ManifestBuilder<TConfig>
  private readonly planner: Planner<TConfig>
  private readonly kubectl: Kubectl
  private readonly resolver: ConfigResolver<TConfig>
  private readonly logger: Logger

  constructor(dependencies: DeployerDependencies<TConfig>) {
    this.manifestBuilder = dependencies.manifestBuilder
    this.planner = dependencies.planner
    this.kubectl = dependencies.kubectl
    this.resolver = dependencies.resolver
    this.logger = dependencies.logger
  }

  /**
   * Deploys apps to Kubernetes.
   *
   * The deployment process:
   * 1. Ensures namespace exists
   * 2. Creates secrets (atomically - all or nothing)
   * 3. Creates ConfigMaps (atomically - all or nothing)
   * 4. Creates Deployment, Service, and network resources (atomically - all or nothing)
   * 
   * All manifests within each group are applied atomically using kubectl batch apply.
   * If any manifest fails, the entire group fails and no changes are made.
   */
  async deploy(options: { namespace?: string; app?: string } = {}): Promise<DeployResult> {
    const plan = await this.planner.plan(options)
    const entries: DeployResult['entries'] = []
    const createdNamespaces = new Set<string>()

    for (const entry of plan.entries) {
      const applied: string[] = []

      // 1. Ensure namespace exists
      if (!createdNamespaces.has(entry.namespace)) {
        const nsManifest = buildNamespace(entry.namespace, {
          'tsops/managed': 'true',
          'tsops/project': this.resolver.project.name
        })

        try {
          const ref = await this.kubectl.apply(nsManifest, {
            namespace: entry.namespace
          })
          applied.push(ref)
        } catch (error) {
          // Namespace might already exist, that's okay
        }

        createdNamespaces.add(entry.namespace)
      }

      // 2. Validate and create secrets (atomically)
      const secretManifests: SupportedManifest[] = []
      for (const [secretName, secretData] of Object.entries(entry.secrets)) {
        // ✨ Validate that all secret values are available
        await this.validateSecretValues(secretName, secretData, entry.namespace, entry.app)

        const secretManifest = buildSecret(
          secretName,
          entry.namespace,
          secretData as Record<string, string>,
          {
            'tsops/app': entry.app,
            'tsops/managed': 'true'
          }
        )
        secretManifests.push(secretManifest)
      }

      if (secretManifests.length > 0) {
        const refs = await this.kubectl.applyBatch(secretManifests, {
          namespace: entry.namespace
        })
        applied.push(...refs)
      }

      // 3. Create ConfigMaps (atomically)
      const configMapManifests: SupportedManifest[] = []
      for (const [configMapName, configMapData] of Object.entries(entry.configMaps)) {
        const configMapManifest = buildConfigMap(
          configMapName,
          entry.namespace,
          configMapData as Record<string, string>,
          {
            'tsops/app': entry.app,
            'tsops/managed': 'true'
          }
        )
        configMapManifests.push(configMapManifest)
      }

      if (configMapManifests.length > 0) {
        const refs = await this.kubectl.applyBatch(configMapManifests, {
          namespace: entry.namespace
        })
        applied.push(...refs)
      }

      // 4. Create app resources (Deployment, Service, Ingress, etc.)
      const serviceName = this.resolver.project.serviceName(entry.app)
      const manifests = this.manifestBuilder.build(entry.app, {
        namespace: entry.namespace,
        serviceName,
        image: entry.image,
        host: entry.host,
        env: entry.env,
        network: entry.network,
        podAnnotations: entry.podAnnotations,
        volumes: entry.volumes,
        volumeMounts: entry.volumeMounts,
        args: entry.args,
        ports: entry.ports
      })

      // 4a. Collect all app manifests
      const manifestList = (
        [
          manifests.deployment,
          manifests.service,
          manifests.ingress,
          manifests.ingressRoute,
          manifests.certificate
        ] as const
      ).filter((manifest): manifest is SupportedManifest => Boolean(manifest))

      // 4b. Apply all app resources atomically
      if (manifestList.length > 0) {
        const refs = await this.kubectl.applyBatch(manifestList, {
          namespace: entry.namespace
        })
        applied.push(...refs)
      }

      entries.push({ ...entry, appliedManifests: applied })
    }

    return { entries }
  }

  /**
   * Validates that all secret values are available either in process.env or in the cluster.
   *
   * This ensures that:
   * 1. If a secret value references process.env variable, it must exist
   * 2. If a secret doesn't exist in process.env, it should already exist in the cluster
   * 3. Fails early with clear error messages if secrets are missing
   *
   * @param secretName - Name of the secret
   * @param secretData - Secret key-value pairs
   * @param namespace - Target namespace
   * @param appName - Application name (for error messages)
   */
  private async validateSecretValues(
    secretName: string,
    secretData: Record<string, string>,
    namespace: string,
    appName: string
  ): Promise<void> {
    const missingInEnv: string[] = []
    const emptyValues: string[] = []

    // Check each secret value
    for (const [key, value] of Object.entries(secretData)) {
      // Check if value is empty or placeholder
      if (!value || value.trim() === '') {
        emptyValues.push(key)
        continue
      }

      // Check if value looks like it should come from process.env
      // (contains references to env vars or is a placeholder)
      if (
        value.includes('process.env') ||
        value.includes('$') ||
        value.match(/change-me|replace-me|todo|fixme/i)
      ) {
        missingInEnv.push(key)
      }
    }

    // If there are missing or placeholder values, check if secret exists in cluster
    if (missingInEnv.length > 0 || emptyValues.length > 0) {
      this.logger.warn(`Secret "${secretName}" contains placeholder or missing values`, {
        app: appName,
        namespace,
        keys: [...missingInEnv, ...emptyValues]
      })

      // Check if secret exists in cluster
      const existingSecret = await this.kubectl.getSecretData(secretName, namespace)

      if (existingSecret) {
        this.logger.info(`Using existing secret "${secretName}" from cluster`, {
          app: appName,
          namespace
        })

        // Verify all required keys exist in cluster secret
        const missingInCluster = [...missingInEnv, ...emptyValues].filter(
          (key) => !existingSecret[key]
        )

        if (missingInCluster.length > 0) {
          throw new Error(
            `Secret "${secretName}" for app "${appName}" is incomplete.\n\n` +
              `The following keys are missing or have placeholder values:\n` +
              `  ${missingInCluster.map((k) => `- ${k}`).join('\n  ')}\n\n` +
              `These keys are not in process.env and not found in the existing cluster secret.\n\n` +
              `Please either:\n` +
              `  1. Set these values in process.env before deployment\n` +
              `  2. Ensure they exist in the cluster secret "${secretName}" in namespace "${namespace}"\n` +
              `  3. Update your tsops.config.ts to provide actual values`
          )
        }
      } else {
        // Secret doesn't exist in cluster, must provide all values
        throw new Error(
          `Secret "${secretName}" for app "${appName}" contains missing or placeholder values.\n\n` +
            `Missing/placeholder keys:\n` +
            `  ${[...missingInEnv, ...emptyValues].map((k) => `- ${k} = "${secretData[k]}"`).join('\n  ')}\n\n` +
            `Secret does not exist in cluster (namespace: "${namespace}").\n\n` +
            `Please provide actual values by:\n` +
            `  1. Setting environment variables before deployment\n` +
            `  2. Updating your tsops.config.ts with real values\n` +
            `  3. Creating the secret manually in the cluster first`
        )
      }
    }
  }

  /**
   * Generates deployment plan with validation and diff against cluster state.
   * 
   * This method checks all artifacts independently:
   * 1. Collects all unique namespaces, secrets, and configmaps across all apps
   * 2. Validates and diffs each global artifact once (no duplicates)
   * 3. For each app, validates and diffs app-specific resources (Deployment, Service, Ingress, etc.)
   * 
   * This approach ensures that shared resources (like secrets used by multiple apps)
   * are only checked once, avoiding duplicates in the plan output.
   * 
   * @param options - Filtering options
   * @param options.namespace - Target a single namespace (optional)
   * @param options.app - Target a single app (optional)
   * @returns Plan with global artifacts and per-app resource changes
   */
  async planWithChanges(options: { namespace?: string; app?: string } = {}): Promise<PlanWithChangesResult> {
    const plan = await this.planner.plan(options)

    // Step 1: Collect all unique global artifacts
    const namespaceSet = new Set<string>()
    const secretsMap = new Map<string, { namespace: string; name: string; data: Record<string, string>; app: string }>()
    const configMapsMap = new Map<string, { namespace: string; name: string; data: Record<string, string>; app: string }>()

    for (const entry of plan.entries) {
      namespaceSet.add(entry.namespace)

      // Collect secrets with unique key: namespace/secretName
      for (const [secretName, secretData] of Object.entries(entry.secrets)) {
        const key = `${entry.namespace}/${secretName}`
        if (!secretsMap.has(key)) {
          secretsMap.set(key, {
            namespace: entry.namespace,
            name: secretName,
            data: secretData as Record<string, string>,
            app: entry.app
          })
        }
      }

      // Collect configmaps with unique key: namespace/configMapName
      for (const [configMapName, configMapData] of Object.entries(entry.configMaps)) {
        const key = `${entry.namespace}/${configMapName}`
        if (!configMapsMap.has(key)) {
          configMapsMap.set(key, {
            namespace: entry.namespace,
            name: configMapName,
            data: configMapData as Record<string, string>,
            app: entry.app
          })
        }
      }
    }

    // Step 2: Check all namespaces
    const namespaceChanges: ManifestChange[] = []
    const existingNamespaces = new Set<string>()
    
    for (const namespace of namespaceSet) {
      const nsManifest = buildNamespace(namespace, {
        'tsops/managed': 'true',
        'tsops/project': this.resolver.project.name
      })
      const change = await this.analyzeManifest(nsManifest, { namespace })
      namespaceChanges.push(change)
      
      // Track which namespaces already exist (will be updated or unchanged)
      if (change.action === 'update' || change.action === 'unchanged') {
        existingNamespaces.add(namespace)
      }
    }

    // Step 3: Check all unique secrets
    const secretChanges: ManifestChange[] = []
    for (const secret of secretsMap.values()) {
      const secretManifest = buildSecret(
        secret.name,
        secret.namespace,
        secret.data,
        {
          'tsops/app': secret.app,
          'tsops/managed': 'true'
        }
      )
      const useClientSide = !existingNamespaces.has(secret.namespace)
      const change = await this.analyzeManifest(secretManifest, { namespace: secret.namespace }, useClientSide)
      secretChanges.push(change)
    }

    // Step 4: Check all unique configmaps
    const configMapChanges: ManifestChange[] = []
    for (const configMap of configMapsMap.values()) {
      const configMapManifest = buildConfigMap(
        configMap.name,
        configMap.namespace,
        configMap.data,
        {
          'tsops/app': configMap.app,
          'tsops/managed': 'true'
        }
      )
      const useClientSide = !existingNamespaces.has(configMap.namespace)
      const change = await this.analyzeManifest(configMapManifest, { namespace: configMap.namespace }, useClientSide)
      configMapChanges.push(change)
    }

    // Step 5: Check app-specific resources (Deployment, Service, Ingress, etc.)
    const appResourceChanges: AppResourceChanges[] = []

    for (const entry of plan.entries) {
      const changes: ManifestChange[] = []
      const serviceName = this.resolver.project.serviceName(entry.app)
      const useClientSide = !existingNamespaces.has(entry.namespace)
      
      const appManifests = this.manifestBuilder.build(entry.app, {
        namespace: entry.namespace,
        serviceName,
        image: entry.image,
        host: entry.host,
        env: entry.env,
        network: entry.network,
        podAnnotations: entry.podAnnotations,
        volumes: entry.volumes,
        volumeMounts: entry.volumeMounts,
        args: entry.args,
        ports: entry.ports
      })

      // Analyze each app manifest
      const manifestList = [
        { manifest: appManifests.deployment, kind: 'Deployment' },
        { manifest: appManifests.service, kind: 'Service' },
        { manifest: appManifests.ingress, kind: 'Ingress' },
        { manifest: appManifests.ingressRoute, kind: 'IngressRoute' },
        { manifest: appManifests.certificate, kind: 'Certificate' }
      ]

      for (const { manifest, kind } of manifestList) {
        if (!manifest) continue

        const change = await this.analyzeManifest(manifest, { namespace: entry.namespace }, useClientSide)
        changes.push(change)
      }

      appResourceChanges.push({
        app: entry.app,
        namespace: entry.namespace,
        image: entry.image,
        host: entry.host,
        changes
      })
    }

    return {
      global: {
        namespaces: namespaceChanges,
        secrets: secretChanges,
        configMaps: configMapChanges
      },
      apps: appResourceChanges
    }
  }

  /**
   * Analyzes a single manifest: validates it and generates diff
   * @param manifest - Manifest to analyze
   * @param options - Apply options
   * @param useClientSide - Use client-side validation (for namespaces that don't exist yet)
   * @returns Change information including validation status and diff
   */
  private async analyzeManifest(
    manifest: SupportedManifest,
    options: { namespace: string },
    useClientSide: boolean = false
  ): Promise<ManifestChange> {
    const kind = String(manifest.kind ?? 'Unknown')
    const name = String(manifest.metadata?.name ?? 'unnamed')

    const change: ManifestChange = {
      kind,
      name,
      namespace: options.namespace,
      action: 'unchanged',
      validated: false
    }

    // Validate manifest
    try {
      await this.kubectl.validate(manifest, options, useClientSide)
      change.validated = true
    } catch (error) {
      change.validated = false
      change.validationError = error instanceof Error ? error.message : String(error)
      return change
    }

    // Get diff
    const diff = await this.kubectl.diff(manifest, options)

    if (diff === null) {
      // Resource doesn't exist yet
      change.action = 'create'
    } else if (diff === '' || diff.trim() === '' || diff === '(dry-run - diff not available)') {
      // No changes - resource exists and is identical
      change.action = 'unchanged'
    } else {
      // Resource will be updated - there are differences
      change.action = 'update'
      change.diff = diff
    }

    return change
  }
}
