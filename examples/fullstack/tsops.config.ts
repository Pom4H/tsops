import type {
  BuildContext,
  ServiceManifestContext,
  TestContext,
  TsOpsConfig
} from '../../src/types.js'

const namespaceManifest = (namespace: string) => ({
  apiVersion: 'v1',
  kind: 'Namespace',
  metadata: {
    name: namespace
  }
})

const config: TsOpsConfig = {
  project: {
    name: 'tsops-fullstack-demo',
    repoUrl: 'https://github.com/Pom4H/tsops',
    defaultBranch: 'main'
  },
  environments: {
    local: {
      cluster: {
        apiServer: 'https://kubernetes.docker.internal:6443',
        context: 'docker-desktop'
      },
      namespace: 'tsops-fullstack',
      imageTagStrategy: { type: 'gitSha', length: 7 },
      ingressController: {
        type: 'traefik',
        namespace: 'traefik-system',
        autoInstall: true,
        serviceType: 'LoadBalancer'
      },
      tls: {
        selfSigned: {
          enabled: false
        }
      }
    }
  },
  services: {
    backend: {
      containerImage: 'tsops-example-backend',
      defaultEnvironment: 'local',
      manifests: ({ env, image }: ServiceManifestContext) => {
        const appLabels = { app: 'backend' }
        return [
          namespaceManifest(env.namespace),
          {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
              name: 'backend',
              namespace: env.namespace,
              labels: appLabels
            },
            spec: {
              replicas: 1,
              selector: { matchLabels: appLabels },
              template: {
                metadata: {
                  labels: appLabels
                },
                spec: {
                  containers: [
                    {
                      name: 'backend',
                      image,
                      imagePullPolicy: 'IfNotPresent',
                      ports: [{ containerPort: 8080 }],
                      env: [
                        { name: 'PORT', value: '8080' },
                        {
                          name: 'FRONTEND_URL',
                          value: `http://frontend.${env.namespace}.svc.cluster.local`
                        }
                      ]
                    }
                  ]
                }
              }
            }
          },
          {
            apiVersion: 'v1',
            kind: 'Service',
            metadata: {
              name: 'backend',
              namespace: env.namespace
            },
            spec: {
              selector: appLabels,
              ports: [
                {
                  port: 8080,
                  targetPort: 8080
                }
              ],
              type: 'ClusterIP'
            }
          }
        ]
      }
    },
    frontend: {
      containerImage: 'tsops-example-frontend',
      defaultEnvironment: 'local',
      manifests: ({ env, image }) => {
        const appLabels = { app: 'frontend' }
        const host = 'fullstack2.localtest.me'
        return [
          namespaceManifest(env.namespace),
          {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
              name: 'frontend',
              namespace: env.namespace,
              labels: appLabels
            },
            spec: {
              replicas: 1,
              selector: { matchLabels: appLabels },
              template: {
                metadata: {
                  labels: appLabels
                },
                spec: {
                  containers: [
                    {
                      name: 'frontend',
                      image,
                      imagePullPolicy: 'IfNotPresent',
                      ports: [{ containerPort: 3000 }],
                      env: [
                        {
                          name: 'PORT',
                          value: '3000'
                        },
                        {
                          name: 'NEXT_PUBLIC_API_BASE_URL',
                          value: `http://backend.${env.namespace}.svc.cluster.local:8080`
                        }
                      ]
                    }
                  ]
                }
              }
            }
          },
          {
            apiVersion: 'v1',
            kind: 'Service',
            metadata: {
              name: 'frontend',
              namespace: env.namespace
            },
            spec: {
              selector: appLabels,
              ports: [
                {
                  name: 'http',
                  port: 80,
                  targetPort: 3000
                }
              ],
              type: 'ClusterIP'
            }
          },
          {
            apiVersion: 'networking.k8s.io/v1',
            kind: 'Ingress',
            metadata: {
              name: 'frontend',
              namespace: env.namespace,
              annotations: {
                'traefik.ingress.kubernetes.io/router.entrypoints': 'web'
              }
            },
            spec: {
              ingressClassName: 'traefik',
              rules: [
                {
                  host,
                  http: {
                    paths: [
                      {
                        path: '/',
                        pathType: 'Prefix',
                        backend: {
                          service: {
                            name: 'frontend',
                            port: { name: 'http' }
                          }
                        }
                      }
                    ]
                  }
                }
              ]
            }
          }
        ]
      }
    }
  },
  pipeline: {
    build: {
      run: async ({ exec, service, git }: BuildContext) => {
        const imageTag = `${service.containerImage}:${git.shortSha}`
        const dockerContext = `examples/fullstack/${service.name}`
        await exec(`docker build -t ${imageTag} -f ${dockerContext}/Dockerfile ${dockerContext}`, {
          env: { DOCKER_BUILDKIT: '1' }
        })
      }
    },
    test: {
      run: async (_ctx: TestContext) => {
        // Tests are omitted for the demo stack.
      }
    },
    deploy: {
      run: async ({ kubectl, environment, service, manifests }) => {
        await kubectl.apply({
          context: environment.cluster.context,
          namespace: environment.namespace,
          manifests
        })
        await kubectl.rolloutStatus({
          context: environment.cluster.context,
          namespace: environment.namespace,
          workload: `deployment/${service.name}`,
          timeoutSeconds: 180
        })
      },
      diff: async ({ kubectl, environment, manifests }) => {
        await kubectl.diff({
          context: environment.cluster.context,
          namespace: environment.namespace,
          manifests
        })
      }
    }
  },
  secrets: {
    provider: { type: 'vault', connection: {} },
    map: {}
  },
  notifications: {
    channels: {},
    onEvents: {}
  }
}

export default config
