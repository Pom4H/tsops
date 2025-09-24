import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import type {
  EnvironmentConfig,
  IngressManifest,
  KubernetesManifest,
  ServiceConfig,
  Logger
} from '../types.js'

import { CommandExecutor } from './command-executor.js'

export class SelfSignedTlsManager {
  private executor: CommandExecutor
  private logger: Logger

  constructor(executor: CommandExecutor, logger: Logger) {
    this.executor = executor
    this.logger = logger
  }

  async ensureTlsSecrets(
    service: ServiceConfig & { name: string },
    environment: EnvironmentConfig & { name: string },
    manifests: KubernetesManifest[]
  ): Promise<void> {
    const tlsConfig = environment.tls?.selfSigned
    if (!tlsConfig?.enabled) {
      return
    }

    const ingressManifests = manifests.filter(
      (manifest): manifest is IngressManifest => (manifest as { kind?: string }).kind === 'Ingress'
    )

    if (ingressManifests.length === 0) {
      return
    }

    const tlsSecrets = new Map<string, Set<string>>()

    for (const ingress of ingressManifests) {
      const spec = (ingress as { spec?: unknown }).spec as
        | {
            tls?: Array<{ secretName?: string; hosts?: string[] }>
          }
        | undefined
      const tlsEntries = Array.isArray(spec?.tls) ? spec?.tls : []
      for (const entry of tlsEntries) {
        const secretName = entry?.secretName
        if (!secretName) {
          continue
        }
        const hosts = Array.isArray(entry?.hosts) ? entry.hosts : []
        const set = tlsSecrets.get(secretName) ?? new Set<string>()
        for (const host of hosts) {
          if (host) {
            set.add(host)
          }
        }
        tlsSecrets.set(secretName, set)
      }
    }

    if (tlsSecrets.size === 0) {
      return
    }

    const context = environment.cluster.context
    const namespace = environment.namespace
    const keySize = tlsConfig.keySize ?? 2048
    const validDays = tlsConfig.validDays ?? 365

    for (const [secretName, hostsSet] of tlsSecrets) {
      const hosts = Array.from(hostsSet)
      const primaryHost = hosts[0] ?? `${service.name}.${environment.name}.local`

      try {
        await this.executor.capture(
          `kubectl --context ${context} --namespace ${namespace} get secret ${secretName}`
        )
        continue
      } catch (error) {
        this.logger.info(
          `Auto-generating self-signed TLS secret "${secretName}" for service "${service.name}" in env "${environment.name}"`
        )
      }

      const certificateHosts = hosts.length > 0 ? hosts : [primaryHost]

      const { cert, key } = await this.generateSelfSignedCertificate(
        certificateHosts,
        keySize,
        validDays
      )

      const secretManifest = this.buildTlsSecretManifest(secretName, namespace, cert, key)

      await this.executor.run(`kubectl --context ${context} apply -f -`, { input: secretManifest })
    }
  }

  private async generateSelfSignedCertificate(
    hosts: string[],
    keySize: number,
    validDays: number
  ): Promise<{ cert: Buffer; key: Buffer }> {
    const cn = hosts[0] ?? 'localhost'
    const altNames = hosts.map((host, index) => `DNS.${index + 1} = ${host}`).join('\n')

    const tmpBase = path.join(tmpdir(), 'tsops-tls-')
    const workdir = await fs.mkdtemp(tmpBase)

    const configPath = path.join(workdir, 'openssl.cnf')
    const keyPath = path.join(workdir, 'tls.key')
    const certPath = path.join(workdir, 'tls.crt')

    const configContent = `
[ req ]
default_bits = ${keySize}
prompt = no
default_md = sha256
req_extensions = v3_req
distinguished_name = dn

[ dn ]
CN = ${cn}

[ v3_req ]
subjectAltName = @alt_names

[ alt_names ]
${altNames || `DNS.1 = ${cn}`}
`.trimStart()

    try {
      await fs.writeFile(configPath, configContent, 'utf8')

      await this.executor.capture(
        `openssl req -x509 -nodes -days ${validDays} -newkey rsa:${keySize} -config ${configPath} -extensions v3_req -keyout ${keyPath} -out ${certPath}`
      )

      const [cert, key] = await Promise.all([fs.readFile(certPath), fs.readFile(keyPath)])

      return { cert, key }
    } finally {
      await fs.rm(workdir, { recursive: true, force: true })
    }
  }

  private buildTlsSecretManifest(
    secretName: string,
    namespace: string,
    cert: Buffer,
    key: Buffer
  ): string {
    const certBase64 = cert.toString('base64')
    const keyBase64 = key.toString('base64')

    return [
      'apiVersion: v1',
      'kind: Secret',
      'metadata:',
      `  name: ${secretName}`,
      `  namespace: ${namespace}`,
      'type: kubernetes.io/tls',
      'data:',
      `  tls.crt: ${certBase64}`,
      `  tls.key: ${keyBase64}`,
      ''
    ].join('\n')
  }
}
