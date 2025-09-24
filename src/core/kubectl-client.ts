import { CommandExecutor } from './command-executor.js'
import type { KubernetesManifest, KubectlClient } from '../types.js'

const serializeManifests = (manifests: KubernetesManifest[]): string => {
  if (manifests.length === 0) {
    return ''
  }

  const documents = manifests.map((manifest) => JSON.stringify(manifest, null, 2)).join('\n---\n')

  return `---\n${documents}`
}

const quoteArgs = (args: string[]): string =>
  args
    .map((value) => {
      if (/^[A-Za-z0-9_.:\/-]+$/.test(value)) {
        return value
      }
      return `'${value.replace(/'/g, "'\\''")}'`
    })
    .join(' ')

export const createDefaultKubectlClient = (executor: CommandExecutor): KubectlClient => ({
  apply: async ({ context, namespace, manifests }) => {
    const manifestPayload = serializeManifests(manifests)
    const command = `kubectl --context ${context} --namespace ${namespace} apply -f -`
    await executor.run(command, { input: manifestPayload })
  },
  diff: async ({ context, namespace, manifests }) => {
    const manifestPayload = serializeManifests(manifests)
    const command = `kubectl --context ${context} --namespace ${namespace} diff -f -`
    await executor.run(command, { input: manifestPayload })
  },
  rolloutStatus: async ({ context, namespace, workload, timeoutSeconds }) => {
    const timeout = timeoutSeconds ? ` --timeout=${timeoutSeconds}s` : ''
    const command =
      `kubectl --context ${context} --namespace ${namespace} rollout status ${workload}` + timeout
    await executor.run(command)
  },
  exec: async ({ context, namespace, podSelector, container, command }) => {
    const selector = Object.entries(podSelector)
      .map(([key, value]) => `${key}=${value}`)
      .join(',')
    const commandString = quoteArgs(command)
    const fullCommand = `kubectl --context ${context} --namespace ${namespace} exec -l ${selector} -c ${container} -- ${commandString}`
    await executor.run(fullCommand)
  }
})

export { serializeManifests }
