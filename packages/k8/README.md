# @tsops/k8

Kubernetes manifest builders and type definitions for tsops.

## Features

- **Type-safe manifest builders** for Deployment, Service, Ingress, IngressRoute (Traefik), and Certificate (cert-manager)
- **Generated Kubernetes API types** from OpenAPI spec
- **Builder pattern** for composing manifests with sensible defaults

## Architecture

### Manifest Builders (`builders/`)

Each builder is a pure function that generates a specific Kubernetes resource:

- **`deployment.ts`** – Creates Deployment manifests with configurable containers, env vars, and labels
- **`service.ts`** – Creates Service manifests with standard port configuration
- **`ingress.ts`** – Creates standard Ingress resources
- **`ingress-route.ts`** – Creates Traefik IngressRoute resources
- **`certificate.ts`** – Creates cert-manager Certificate resources

### Main Builder

**`manifest-builder.ts`** – The `ManifestBuilder` class that coordinates all builders:

```typescript
class ManifestBuilder<TConfig> {
  build(appName: string, ctx: ManifestBuilderContext): ManifestSet {
    // Returns: { deployment, service, ingress?, ingressRoute?, certificate? }
  }
}
```

## Usage

### Direct Usage

```typescript
import { ManifestBuilder } from '@tsops/k8'

const builder = new ManifestBuilder({ project: 'myapp' })

const manifests = builder.build('api', {
  namespace: 'prod',
  serviceName: 'myapp-api',
  image: 'ghcr.io/org/api:v1.0.0',
  host: 'api.example.com',
  env: { NODE_ENV: 'production' },
  network: {
    ingress: { className: 'nginx' },
    certificate: {
      issuerRef: { kind: 'ClusterIssuer', name: 'letsencrypt' },
      dnsNames: ['api.example.com']
    }
  }
})

console.log(manifests.deployment)
console.log(manifests.service)
console.log(manifests.ingress)
console.log(manifests.certificate)
```

### Network Configuration

The `network` field in the context supports:

#### Ingress (Standard Kubernetes)

```typescript
network: {
  ingress: {
    className: 'nginx',
    annotations: { 'nginx.ingress.kubernetes.io/rewrite-target': '/' },
    path: '/api',
    pathType: 'Prefix',
    tls: [{ secretName: 'api-tls', hosts: ['api.example.com'] }]
  }
}
```

#### IngressRoute (Traefik)

```typescript
network: {
  ingressRoute: {
    entryPoints: ['websecure'],
    routes: [
      {
        match: 'Host(`api.example.com`)',
        middlewares: [{ name: 'redirect-https' }],
        services: [{ name: 'api', port: 8080 }]
      }
    ],
    tls: { certResolver: 'letsencrypt' }
  }
}
```

#### Certificate (cert-manager)

```typescript
network: {
  certificate: {
    secretName: 'api-tls',
    issuerRef: { kind: 'ClusterIssuer', name: 'letsencrypt-prod' },
    dnsNames: ['api.example.com', 'www.api.example.com'],
    duration: '2160h', // 90 days
    renewBefore: '360h' // 15 days
  }
}
```

## Types

### Generated Types

Kubernetes API types are generated from the official OpenAPI spec and live in `generated/k8s-openapi.d.ts`.

### Builder Types

The package exports several type definitions:

- **`ManifestSet`** – Collection of all possible manifests for an app
- **`ManifestBuilderContext`** – Input context for building manifests
- **`ResolvedNetworkConfig`** – Network configuration after resolution
- **`ResolvedIngressConfig`**, **`ResolvedIngressRouteConfig`**, **`ResolvedCertificateConfig`** – Individual network component configs

## Constants

```typescript
import { DEFAULT_HTTP_PORT } from '@tsops/k8'

console.log(DEFAULT_HTTP_PORT) // 8080
```

## Development

```bash
pnpm build       # Compile TypeScript
```

To regenerate Kubernetes types from OpenAPI spec, see the scripts directory in the legacy package (this is typically done once per Kubernetes version update).

## Related Packages

- **@tsops/core** – Core orchestration and configuration
- **tsops** – Command-line interface

