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
      link: https://github.com/yourusername/tsops

features:
  - icon: 🎯
    title: Type-Safe Configuration
    details: Write your Kubernetes configuration in TypeScript with full type safety and IntelliSense support.
    
  - icon: ✨
    title: Context Helpers
    details: Built-in helpers for service DNS, subdomains, and secrets - no more hardcoded values.
    
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
    details: Reference entire secrets as environment variables with a single function call.
    
  - icon: 🛡️
    title: Production Ready
    details: Battle-tested in production with comprehensive validation and error handling.
---

## Quick Example

```typescript
import { defineConfig } from '@tsops/core'

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
      env: ({ 
        serviceDNS,     // Enhanced with protocols & options
        secret,         // Simplified API (no secretKey needed)
        appName,        // Current app name
        template,       // Template strings
        production,     // Namespace variables
        replicas        // Namespace variables
      }) => ({
        // Namespace-based environment flags
        NODE_ENV: production ? 'production' : 'development',
        
        // Metadata
        SERVICE_NAME: appName,
        
        // Simple service DNS
        REDIS_URL: serviceDNS('redis', 6379),
        
        // With protocol (new!)
        POSTGRES_URL: serviceDNS('postgres', { 
          port: 5432, 
          protocol: 'postgresql' 
        }),
        
        // Secret references (unified API)
        JWT_SECRET: secret('api-secrets', 'JWT_SECRET'),
        
        // Template helper (new!)
        DATABASE_URL: template('postgresql://{host}/mydb', {
          host: serviceDNS('postgres')
        }),
        
        // Namespace variables
        WORKER_COUNT: String(replicas * 2)
      })
    }
  }
})
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


