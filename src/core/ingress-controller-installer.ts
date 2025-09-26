import type {
  EnvironmentConfig,
  IngressControllerConfig,
  Logger,
  LetsEncryptTlsConfig
} from '../types.js'
import { CommandExecutor } from './command-executor.js'

export class IngressControllerInstaller {
  private readonly ensuredControllers = new Set<string>()

  private readonly executor: CommandExecutor
  private readonly logger: Logger

  constructor(executor: CommandExecutor, logger: Logger) {
    this.executor = executor
    this.logger = logger
  }

  async ensure(environment: EnvironmentConfig & { name: string }): Promise<void> {
    const controller = environment.ingressController
    if (!controller || !controller.autoInstall) {
      return
    }

    const key = `${environment.cluster.context}:${controller.type}:${controller.namespace ?? 'kube-system'}`
    if (this.ensuredControllers.has(key)) {
      return
    }

    if (environment.tls?.letsEncrypt?.enabled) {
      await this.ensureCertManager(environment)
    }

    switch (controller.type) {
      case 'traefik':
        await this.ensureTraefikController(environment, controller)
        break
      default:
        this.logger.warn(`Unsupported ingress controller type "${controller.type}"`)
        return
    }

    this.ensuredControllers.add(key)
  }

  private async ensureTraefikController(
    environment: EnvironmentConfig & { name: string },
    controller: IngressControllerConfig
  ): Promise<void> {
    const namespace = controller.namespace ?? 'kube-system'
    const context = environment.cluster.context

    let deploymentExists = true
    try {
      await this.executor.capture(
        `kubectl --context ${context} --namespace ${namespace} get deployment traefik`
      )
    } catch {
      deploymentExists = false
      this.logger.info(
        `Installing Traefik ingress controller into namespace "${namespace}" for context "${context}"`
      )
    }

    const manifest = this.buildTraefikManifest(
      namespace,
      controller.serviceType ?? 'LoadBalancer',
      environment.tls?.letsEncrypt
    )

    await this.executor.run(`kubectl --context ${context} apply -f -`, {
      input: manifest
    })
  }

  private buildTraefikManifest(
    namespace: string,
    serviceType: 'LoadBalancer' | 'NodePort' | 'ClusterIP',
    letsEncryptConfig?: LetsEncryptTlsConfig
  ): string {
    const serviceExtra =
      serviceType === 'NodePort'
        ? '  externalTrafficPolicy: Cluster\n  ports:\n    - name: web\n      port: 80\n      targetPort: web\n      nodePort: 32080\n    - name: websecure\n      port: 443\n      targetPort: websecure\n      nodePort: 32443'
        : '  ports:\n    - name: web\n      port: 80\n      targetPort: web\n    - name: websecure\n      port: 443\n      targetPort: websecure'

    return `apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}
---
apiVersion: networking.k8s.io/v1
kind: IngressClass
metadata:
  name: traefik
spec:
  controller: traefik.io/ingress-controller
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: traefik
  namespace: ${namespace}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: traefik
rules:
  - apiGroups:
      - ""
    resources:
      - services
      - endpoints
      - secrets
      - configmaps
      - nodes
    verbs:
      - get
      - list
      - watch
  - apiGroups:
      - discovery.k8s.io
    resources:
      - endpointslices
    verbs:
      - get
      - list
      - watch
  - apiGroups:
      - extensions
      - networking.k8s.io
    resources:
      - ingresses
      - ingressclasses
    verbs:
      - get
      - list
      - watch
  - apiGroups:
      - extensions
      - networking.k8s.io
    resources:
      - ingresses/status
    verbs:
      - update
  - apiGroups:
      - traefik.io
      - traefik.containo.us
    resources:
      - ingressroutes
      - ingressroutetcps
      - ingressrouteudps
      - middlewares
      - middlewaretcps
      - tlsoptions
      - tlsstores
      - traefikservices
      - serverstransports
      - serverstransporttcps
    verbs:
      - get
      - list
      - watch
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: traefik
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: traefik
subjects:
  - kind: ServiceAccount
    name: traefik
    namespace: ${namespace}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: traefik
  namespace: ${namespace}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: traefik
  template:
    metadata:
      labels:
        app: traefik
    spec:
      serviceAccountName: traefik
      containers:
        - name: traefik
          image: traefik:v3.5.2
          args:
            - --entrypoints.web.Address=:80
            - --entrypoints.websecure.Address=:443
            - --providers.kubernetesingress
            - --providers.kubernetesingress.ingressclass=traefik
            - --providers.kubernetescrd
            - --api.dashboard=true${
              letsEncryptConfig
                ? `
            - --certificatesresolvers.letsencrypt.acme.tlschallenge=true
            - --certificatesresolvers.letsencrypt.acme.email=${letsEncryptConfig.email}
            - --certificatesresolvers.letsencrypt.acme.storage=/data/acme.json
            - --certificatesresolvers.letsencrypt.acme.caserver=${letsEncryptConfig.staging ? 'https://acme-staging-v02.api.letsencrypt.org/directory' : 'https://acme-v02.api.letsencrypt.org/directory'}`
                : ''
            }
          ports:
            - name: web
              containerPort: 80
            - name: websecure
              containerPort: 443${
                letsEncryptConfig
                  ? `
          volumeMounts:
            - name: acme-storage
              mountPath: /data`
                  : ''
              }
      ${
        letsEncryptConfig
          ? `volumes:
        - name: acme-storage
          emptyDir: {}`
          : ''
      }
---
apiVersion: v1
kind: Service
metadata:
  name: traefik
  namespace: ${namespace}
spec:
  type: ${serviceType}
${serviceExtra}
  selector:
    app: traefik
`
  }

  private async ensureCertManager(
    environment: EnvironmentConfig & { name: string }
  ): Promise<void> {
    const context = environment.cluster.context
    const letsEncryptConfig = environment.tls?.letsEncrypt

    if (!letsEncryptConfig) {
      return
    }

    this.logger.info(`Traefik will use built-in Let's Encrypt resolver for context "${context}"`)
    this.logger.info(`Email: ${letsEncryptConfig.email}, Staging: ${letsEncryptConfig.staging}`)
  }
}
