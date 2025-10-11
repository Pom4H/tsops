import { defineConfig } from 'tsops'

/**
 * Example demonstrating different cache strategies for Docker builds
 * 
 * tsops supports multiple cache backends to speed up Docker image builds:
 * 
 * 1. Registry Cache (recommended for CI/CD):
 *    - Stores cache in a container registry
 *    - Sharable across different machines/CI runners
 *    - Requires push access to registry
 * 
 * 2. GitHub Actions Cache:
 *    - Native GHA cache integration
 *    - Automatic authentication
 *    - Limited to 10GB per repository
 * 
 * 3. S3 Cache:
 *    - Stores cache in AWS S3 bucket
 *    - Good for large monorepos
 *    - Requires AWS credentials
 * 
 * 4. Local Cache:
 *    - Stores cache on local filesystem
 *    - Fast for local development
 *    - Not shared across machines
 * 
 * 5. Inline Cache:
 *    - Embeds cache in the final image
 *    - No separate cache storage needed
 *    - Increases image size
 */

// Example 1: Registry Cache (Global Configuration)
export const registryCacheConfig = defineConfig({
  project: 'cache-demo-registry',
  namespaces: { dev: {} },
  clusters: {
    local: {
      apiServer: 'https://kubernetes.docker.internal:6443',
      context: 'docker-desktop',
      namespaces: ['dev']
    }
  },
  images: {
    registry: 'ghcr.io/myorg',
    tagStrategy: 'git-sha',
    // Global cache configuration applied to all apps
    cache: {
      type: 'registry',
      // Optional: custom cache reference
      // ref: 'ghcr.io/myorg/cache:buildcache',
      mode: 'max', // Cache all layers (slower export, faster builds)
      inline: true // Also embed cache in image for extra resilience
    }
  },
  apps: {
    api: {
      build: {
        type: 'dockerfile',
        context: '.',
        dockerfile: 'Dockerfile'
      },
      ports: [{ name: 'http', port: 3000 }]
    }
  }
})

// Example 2: GitHub Actions Cache
export const ghaCacheConfig = defineConfig({
  project: 'cache-demo-gha',
  namespaces: { dev: {} },
  clusters: {
    local: {
      apiServer: 'https://kubernetes.docker.internal:6443',
      context: 'docker-desktop',
      namespaces: ['dev']
    }
  },
  images: {
    registry: 'ghcr.io/myorg',
    tagStrategy: 'git-sha',
    cache: {
      type: 'gha',
      scope: 'main' // Cache scope (branch name or custom)
    }
  },
  apps: {
    web: {
      build: {
        type: 'dockerfile',
        context: '.',
        dockerfile: 'Dockerfile'
      },
      ports: [{ name: 'http', port: 80 }]
    }
  }
})

// Example 3: S3 Cache
export const s3CacheConfig = defineConfig({
  project: 'cache-demo-s3',
  namespaces: { dev: {} },
  clusters: {
    local: {
      apiServer: 'https://kubernetes.docker.internal:6443',
      context: 'docker-desktop',
      namespaces: ['dev']
    }
  },
  images: {
    registry: 'ghcr.io/myorg',
    tagStrategy: 'git-sha',
    cache: {
      type: 's3',
      bucket: 'my-docker-cache-bucket',
      region: 'us-east-1',
      prefix: 'buildkit-cache/' // Optional path prefix in bucket
    }
  },
  apps: {
    worker: {
      build: {
        type: 'dockerfile',
        context: '.',
        dockerfile: 'Dockerfile'
      },
      ports: [{ name: 'http', port: 8080 }]
    }
  }
})

// Example 4: Per-App Cache Override
export const perAppCacheConfig = defineConfig({
  project: 'cache-demo-override',
  namespaces: { dev: {} },
  clusters: {
    local: {
      apiServer: 'https://kubernetes.docker.internal:6443',
      context: 'docker-desktop',
      namespaces: ['dev']
    }
  },
  images: {
    registry: 'ghcr.io/myorg',
    tagStrategy: 'git-sha',
    // Global default: registry cache
    cache: {
      type: 'registry',
      mode: 'max'
    }
  },
  apps: {
    frontend: {
      build: {
        type: 'dockerfile',
        context: './frontend',
        dockerfile: './frontend/Dockerfile',
        // Override: use local cache for this app
        cache: {
          type: 'local',
          dest: './frontend/.buildkit-cache'
        }
      },
      ports: [{ name: 'http', port: 3000 }]
    },
    backend: {
      build: {
        type: 'dockerfile',
        context: './backend',
        dockerfile: './backend/Dockerfile',
        // Disable cache for this app
        cache: false
      },
      ports: [{ name: 'http', port: 4000 }]
    },
    database: {
      // Uses global registry cache (inherited)
      build: {
        type: 'dockerfile',
        context: './database',
        dockerfile: './database/Dockerfile'
      },
      ports: [{ name: 'postgres', port: 5432 }]
    }
  }
})

// Export default configuration
export default registryCacheConfig
