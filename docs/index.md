---
layout: home

hero:
  name: "tsops"
  text: "TypeScript-first Kubernetes toolkit"
  tagline: Deploy to Kubernetes with confidence using type-safe configuration
  image:
    src: /logo.svg
    alt: tsops logo
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View Examples
      link: /examples/
    - theme: alt
      text: GitHub
      link: https://github.com/Pom4H/tsops

features:
  - icon: 🎯
    title: Type-Safe Configuration
    details: Write your Kubernetes configuration in TypeScript with full type safety and IntelliSense support.
    
  - icon: ✨
    title: Context Helpers
    details: Built-in helpers for service DNS and secrets — no more hardcoded values.
    
  - icon: 🔒
    title: Secret Validation
    details: Automatic validation of secrets before deployment with fallback to cluster secrets.
    
  - icon: 🚀
    title: Single Source of Truth
    details: Define once, use everywhere - from deployment to runtime with @tsops/runtime.
    
  - icon: 📦
    title: Docker Build Integration
    details: Built-in Docker image building and pushing with smart tag strategies.
    
  - icon: 🌐
    title: Multi-Environment
    details: Easy management of dev, staging, and production environments with shared configuration.
    
  - icon: 🎨
    title: Clean DX
    details: Beautiful CLI output, helpful error messages, and zero-config setup.
    
  - icon: 🔄
    title: envFrom Support
    details: Reference entire secrets/configMaps as environment variables with a single function call.
    
  - icon: 🛡️
    title: Production Ready
    details: Battle-tested in production with comprehensive validation and error handling.
---

## Installation

Install as a runtime dependency. The `defineConfig()` helper returns a runtime config object that your applications can import directly as a single source of truth (endpoints, env, hosts).

```bash
npm install tsops
# or
pnpm add tsops
# or
yarn add tsops
```

## Quick Example

```typescript
import { defineConfig } from 'tsops'

export default defineConfig({
  project: 'my-app',
  
  namespaces: {
    prod: { 
      domain: 'example.com',
      production: true,
      replicas: 3 
    },
    dev: { 
      domain: 'dev.example.com',
      production: false,
      replicas: 1 
    }
  },
  
  secrets: {
    'api-secrets': ({ env }) => ({
      // Use env() helper with smart fallbacks
      JWT_SECRET: env('JWT_SECRET', 'dev-jwt'),
      API_KEY: env('API_KEY')
    })
  },
  
  apps: {
    api: {
      network: ({ domain }) => `api.${domain}`,
      ports: [{ name: 'http', port: 80, targetPort: 8080 }],
      env: ({ serviceDNS, secret, appName, template, production, replicas }) => ({
        // Flags
        NODE_ENV: production ? 'production' : 'development',
        
        // Metadata
        SERVICE_NAME: appName,
        
        // Dependencies
        REDIS_HOST: serviceDNS('redis'),
        REDIS_URL: serviceDNS('redis', 6379),
        POSTGRES_URL: template('postgresql://{host}/{db}', {
          host: serviceDNS('postgres', 5432),
          db: 'mydb'
        }),
        
        // Secrets
        JWT_SECRET: secret('api-secrets', 'JWT_SECRET'),
        
        // Namespace variables
        WORKER_COUNT: String(replicas * 2)
      })
    },
    web: {
      network: ({ domain }) => `web.${domain}`,
      ports: [{ name: 'http', port: 80, targetPort: 3000 }],
      env: ({ template, serviceDNS, production }) => ({
        NODE_ENV: production ? 'production' : 'development',
        API_URL: template('http://{host}', {
          host: serviceDNS('api', 8080)
        })
      })
    }
  }
})
```

 

## Use in your app (runtime)

Import your `tsops.config.ts` in any service to access resolved endpoints and env at runtime.

```ts
// frontend/app/page.ts (or any service file)
import config from './tsops.config'

// Automatically respects TSOPS_NAMESPACE (dev/prod)
const backendBase = config.getInternalEndpoint('backend')
// e.g. http://myproj-backend.dev.svc.cluster.local:8080

export default async function Page() {
  const res = await fetch(`${backendBase}/api/message`, { cache: 'no-store' })
  const data = res.ok ? await res.json() : { message: `HTTP ${res.status}` }
  return (
    <main>
      <h1>Frontend</h1>
      <p>Backend says: {data.message}</p>
    </main>
  )
}
```

## Why tsops?

<div class="features-grid">

### 🎯 **Type Safety**
No more YAML typos. Get instant feedback with TypeScript's type system and catch errors before deployment.

### 🚀 **Developer Experience**
Beautiful CLI, helpful error messages, and zero-config setup. Start deploying in minutes, not hours.

### 🔒 **Secure by Default**
Automatic secret validation, fallback to cluster secrets, and clear error messages when something's missing.

### 📦 **All-in-One**
Plan, build, and deploy - all from a single tool. No need to juggle multiple CLIs and tools.

</div>

## What People Say

> "tsops transformed our deployment workflow. No more YAML hell, just clean TypeScript configuration."
> 
> — *Production User*

> "The context helpers are a game-changer. serviceDNS() alone saved us hours of configuration work."
> 
> — *DevOps Engineer*

> "Secret validation caught so many issues before they hit production. This tool pays for itself."
> 
> — *Platform Team Lead*

## Ready to Get Started?

<div class="cta-grid">

### [📚 Read the Guide](/guide/getting-started)
Learn the basics and deploy your first app

### [💡 See Examples](/examples/)
Explore real-world use cases

### [🔧 API Reference](/api/)
Dive into the full API

</div>

<style>
.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 2rem;
  margin: 2rem 0;
}

.features-grid > div {
  padding: 1.5rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
}

.cta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin: 2rem 0;
}

.cta-grid > div {
  padding: 2rem;
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  text-align: center;
}

.cta-grid a {
  font-size: 1.2rem;
  font-weight: 600;
}
</style>


