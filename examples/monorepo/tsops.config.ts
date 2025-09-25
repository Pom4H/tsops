import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from '../../dist/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dockerfilePath = path.join(__dirname, 'Dockerfile')

const serviceMeta = {
  frontend: {
    packageName: '@monorepo/frontend',
    serviceDir: 'apps/frontend',
    port: 3000
  },
  backend: {
    packageName: '@monorepo/backend',
    serviceDir: 'apps/backend',
    port: 4000
  }
} satisfies Record<
  string,
  {
    packageName: string
    serviceDir: string
    port: number
  }
>

const backendSecretName = 'monorepo-backend-env'

const namespaceManifest = (namespace: string) => ({
  apiVersion: 'v1',
  kind: 'Namespace',
  metadata: { name: namespace }
})

const config = defineConfig({
  project: {
    name: 'tsops-monorepo-demo',
    repoUrl: 'https://github.com/Pom4H/tsops',
    defaultBranch: 'main'
  },
  environments: {
    local: {
      cluster: {
        apiServer: 'https://kubernetes.docker.internal:6443',
        context: 'docker-desktop'
      },
      namespace: 'tsops-monorepo',
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
      containerImage: 'tsops-monorepo-backend',
      defaultEnvironment: 'local',
      build: {
        type: 'dockerfile',
        context: __dirname,
        dockerfile: dockerfilePath,
        buildArgs: {
          PACKAGE_NAME: serviceMeta.backend.packageName,
          SERVICE_DIR: serviceMeta.backend.serviceDir,
          NODE_VERSION: '20'
        },
        env: {
          DOCKER_BUILDKIT: '1'
        }
      },
      manifests: ({ env, image }) => {
        const labels = { app: 'monorepo-backend' }
        return [
          namespaceManifest(env.namespace),
          {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
              name: 'backend',
              namespace: env.namespace,
              labels
            },
            spec: {
              replicas: 1,
              selector: { matchLabels: labels },
              template: {
                metadata: { labels },
                spec: {
                  containers: [
                    {
                      name: 'backend',
                      image,
                      imagePullPolicy: 'IfNotPresent',
                      ports: [{ containerPort: serviceMeta.backend.port }],
                      env: [
                        { name: 'PORT', value: String(serviceMeta.backend.port) },
                        { name: 'NODE_ENV', value: 'production' },
                        { name: 'RELEASE', value: env.name },
                        {
                          name: 'FRONTEND_URL',
                          value: `http://frontend.${env.namespace}.svc.cluster.local:${serviceMeta.frontend.port}`
                        }
                      ],
                      envFrom: [
                        {
                          secretRef: { name: backendSecretName }
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
              selector: labels,
              ports: [
                {
                  name: 'http',
                  port: serviceMeta.backend.port,
                  targetPort: serviceMeta.backend.port
                }
              ],
              type: 'ClusterIP'
            }
          }
        ]
      }
    },
    frontend: {
      containerImage: 'tsops-monorepo-frontend',
      defaultEnvironment: 'local',
      dependsOn: ['backend'],
      build: {
        type: 'dockerfile',
        context: __dirname,
        dockerfile: dockerfilePath,
        buildArgs: {
          PACKAGE_NAME: serviceMeta.frontend.packageName,
          SERVICE_DIR: serviceMeta.frontend.serviceDir,
          NODE_VERSION: '20'
        },
        env: {
          DOCKER_BUILDKIT: '1'
        }
      },
      manifests: ({ env, image }) => {
        const labels = { app: 'monorepo-frontend' }
        const host = 'monorepo.localtest.me'
        return [
          namespaceManifest(env.namespace),
          {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
              name: 'frontend',
              namespace: env.namespace,
              labels
            },
            spec: {
              replicas: 1,
              selector: { matchLabels: labels },
              template: {
                metadata: { labels },
                spec: {
                  containers: [
                    {
                      name: 'frontend',
                      image,
                      imagePullPolicy: 'IfNotPresent',
                      ports: [{ containerPort: serviceMeta.frontend.port }],
                      env: [
                        { name: 'PORT', value: String(serviceMeta.frontend.port) },
                        { name: 'NODE_ENV', value: 'production' },
                        { name: 'PAGE_TITLE', value: 'Turbo Monorepo Frontend' },
                        {
                          name: 'BACKEND_INTERNAL_URL',
                          value: `http://backend.${env.namespace}.svc.cluster.local:${serviceMeta.backend.port}`
                        },
                        {
                          name: 'BACKEND_PUBLIC_URL',
                          value: '/api'
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
              selector: labels,
              ports: [
                {
                  name: 'http',
                  port: 80,
                  targetPort: serviceMeta.frontend.port
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
  hooks: {
    beforeDeploy: [
      async ({ kubectl, environment, service }) => {
        if (!kubectl || !environment || !service || service.name !== 'backend') {
          return
        }

        const token = process.env.BACKEND_API_TOKEN
        if (!token) {
          console.warn(
            '[tsops] BACKEND_API_TOKEN not set; backend secret will not be updated during deploy.'
          )
          return
        }

        await kubectl.apply({
          context: environment.cluster.context,
          namespace: environment.namespace,
          manifests: [
            {
              apiVersion: 'v1',
              kind: 'Secret',
              metadata: {
                name: backendSecretName,
                namespace: environment.namespace,
                labels: {
                  'app.kubernetes.io/name': 'backend',
                  'app.kubernetes.io/component': 'api'
                }
              },
              type: 'Opaque',
              stringData: {
                API_TOKEN: token
              }
            }
          ]
        })
      }
    ]
  },
})

export default config
