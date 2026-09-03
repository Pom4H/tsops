# Context helpers

Application configuration callbacks receive two things in one typed object:

1. metadata and helper functions supplied by tsops;
2. custom variables from the selected namespace.

```ts
apps: {
  api: {
    env: ({ project, namespace, production, url, secret }) => ({
      PROJECT: project,
      NAMESPACE: namespace,
      NODE_ENV: production ? 'production' : 'development',
      WEB_URL: url('web', 'service'),
      DATABASE_URL: secret('database', 'DATABASE_URL')
    })
  }
}
```

Literal application, Secret, and ConfigMap names are inferred from the surrounding `defineConfig` call.

## Metadata

### `project`

The stable project name from the root config.

```ts
env: ({ project }) => ({ PROJECT: project })
```

### `namespace`

The resolved static or materialized overlay namespace name.

```ts
env: ({ namespace }) => ({ NAMESPACE: namespace })
```

### `appName`

The application currently being resolved.

```ts
env: ({ appName }) => ({ SERVICE_NAME: appName })
```

Do not use nondeterministic values such as `Date.now()` or random identifiers in a configuration callback. Equal graph inputs should produce equal resources.

### `cluster`

Metadata from the cluster definition selected for the namespace:

```ts
env: ({ cluster }) => ({
  CLUSTER_NAME: cluster.name,
  KUBERNETES_API: cluster.apiServer
})
```

## Runtime-aware endpoints

### `url(app, type, options?)`

Returns a complete URL for an application endpoint.

```ts
url('api', 'service')
url('api', 'cluster')
url('api', 'ingress')
url('metrics', 'service', { port: 'prometheus' })
url('admin', 'service', { protocol: 'https' })
```

The endpoint type means:

| Type | Meaning |
| --- | --- |
| `service` | Normal application-to-application endpoint |
| `cluster` | Fully qualified Kubernetes Service endpoint |
| `ingress` | Public endpoint derived from ingress configuration |

For `runtime: 'local'`, service and cluster URLs resolve through the `TSOPS_DEV_URLS` map under `tsops dev`, or through a localhost fallback outside it. For `runtime: 'docker'`, they resolve through the application name and target port. For Kubernetes they resolve through Services and cluster DNS.

### `dns(app, type)`

Returns the host component without a scheme:

```ts
dns('api', 'service')
dns('api', 'cluster')
dns('api', 'ingress')
```

Unlike `url`, `dns` does not accept protocol or named-port options.

### Port helpers

```ts
servicePort('api')
servicePort('metrics', 'prometheus')

targetPort('api')
listenPort('api')
```

- `servicePort` is what another Kubernetes Service client dials.
- `targetPort` is the numeric container or local process port.
- `listenPort` is an alias for `targetPort` and expresses application intent.

## Secrets and ConfigMaps

Define named resources once:

```ts
export default defineConfig({
  // ...project, namespaces, clusters, images
  secrets: {
    database: {
      DATABASE_URL: process.env.DATABASE_URL ?? ''
    }
  },
  configMaps: {
    runtime: {
      LOG_LEVEL: 'info'
    }
  },
  apps: {
    // ...
  }
})
```

### Whole-resource references

Return a whole reference when every key should become application environment:

```ts
env: [
  ({ configMap }) => configMap('runtime'),
  ({ secret }) => secret('database')
]
```

These become Kubernetes `envFrom` entries.

### Key references

Use the second argument for one key:

```ts
env: ({ secret, configMap }) => ({
  DATABASE_URL: secret('database', 'DATABASE_URL'),
  LOG_LEVEL: configMap('runtime', 'LOG_LEVEL')
})
```

These become Kubernetes `valueFrom` entries. There are no separate `secretKey` or `configMapKey` callback helpers.

## Names and labels

### `label(key, value?)`

Builds an `app.kubernetes.io/*` selector string:

```ts
label('name')
label('component', 'backend')
```

### `resource(kind, name)`

Builds a deterministic resource name using project conventions:

```ts
resource('secret', 'database')
resource('configmap', 'runtime')
resource('pvc', 'data')
resource('serviceaccount', 'worker')
```

Supported kinds are `secret`, `configmap`, `pvc`, `sa`, and `serviceaccount`.

## Environment lookup

### `env(key, fallback?)`

Reads a host environment variable through the configured environment provider:

```ts
env: ({ env, production }) => ({
  LOG_LEVEL: env('LOG_LEVEL', production ? 'warn' : 'debug')
})
```

Use Kubernetes Secret references for application credentials. A plain build-time environment value may become part of an image layer and is covered by sensitive-environment validation.

## String templates

### `template(value, variables)`

Replaces `{name}` placeholders:

```ts
env: ({ template, domain }) => ({
  CALLBACK_URL: template('https://{domain}/auth/callback', { domain })
})
```

Missing placeholders resolve to an empty string, so prefer direct template literals when TypeScript can express the value more clearly.

## Namespace variables

Custom namespace fields are spread into every application callback:

```ts
namespaces: {
  staging: {
    domain: 'staging.example.com',
    production: false,
    replicas: 1
  },
  production: {
    domain: 'example.com',
    production: true,
    replicas: 3
  }
},

apps: {
  api: {
    replicas: ({ replicas }) => replicas,
    env: ({ production }) => ({
      NODE_ENV: production ? 'production' : 'development'
    })
  }
}
```

Custom fields cannot use reserved helper names such as `url`, `secret`, `namespace`, or `cluster`.

## Runtime helpers in application code

The object returned by `defineConfig` exposes a smaller runtime API outside callbacks:

```ts
import config from '../../tsops.config.js'

const apiUrl = config.url('api', 'service')
const apiHost = config.dns('api', 'service')
const listenPort = config.listenPort('api')
const nodeEnv = config.env('api', 'NODE_ENV')
```

These methods use `TSOPS_NAMESPACE`, and service URL resolution consumes the Portless map supplied by `tsops dev` when present.

See the [API reference](/api/) for signatures and [Local development](/guide/local-development) for runtime behavior.
