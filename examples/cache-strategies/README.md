# Docker BuildKit Remote Cache Integration

This example demonstrates how to configure Docker BuildKit remote caching in `tsops` to speed up Docker image builds by reusing layers from previous builds.

## Overview

Remote caching allows you to share Docker build cache across different machines, CI/CD runners, or team members. This significantly reduces build times, especially for large monorepos with shared dependencies.

## Cache Backends

### 1. Registry Cache (Recommended for CI/CD)

Stores cache in a container registry. Best for production CI/CD pipelines.

```typescript
import { defineConfig } from 'tsops'

export default defineConfig({
  project: 'my-app',
  namespaces: { prod: {} },
  clusters: { /* ... */ },
  images: {
    registry: 'ghcr.io/myorg',
    tagStrategy: 'git-sha',
    cache: {
      type: 'registry',
      // Optional: custom cache reference (defaults to {imageRef}-cache)
      ref: 'ghcr.io/myorg/cache:buildcache',
      mode: 'max', // 'max' = cache all layers, 'min' = only final layers
      inline: true  // Also embed cache metadata in the image
    }
  },
  apps: { /* ... */ }
})
```

**Pros:**
- Shareable across all machines/runners
- No size limits (beyond registry storage)
- Works with any registry (GitHub Container Registry, Docker Hub, AWS ECR, etc.)

**Cons:**
- Requires push/pull permissions to registry
- Network overhead for cache transfer

---

### 2. GitHub Actions Cache

Native integration with GitHub Actions cache. Limited to 10GB per repository.

```typescript
images: {
  registry: 'ghcr.io/myorg',
  tagStrategy: 'git-sha',
  cache: {
    type: 'gha',
    scope: 'main' // Cache scope (branch name or custom identifier)
  }
}
```

**Pros:**
- Automatic authentication in GHA
- No registry permissions needed
- Fast in GitHub Actions environment

**Cons:**
- Only works in GitHub Actions
- 10GB cache limit per repository
- Cache expires after 7 days of inactivity

---

### 3. S3 Cache

Stores cache in AWS S3 bucket. Great for large monorepos.

```typescript
images: {
  registry: 'ghcr.io/myorg',
  tagStrategy: 'git-sha',
  cache: {
    type: 's3',
    bucket: 'my-docker-cache-bucket',
    region: 'us-east-1',
    prefix: 'buildkit-cache/' // Optional path prefix
  }
}
```

**Pros:**
- Large storage capacity
- Pay only for what you use
- Fast if in same AWS region

**Cons:**
- Requires AWS credentials
- AWS costs for storage and transfer
- Setup overhead

---

### 4. Local Cache

Stores cache on local filesystem. Best for local development.

```typescript
images: {
  registry: 'ghcr.io/myorg',
  tagStrategy: 'git-sha',
  cache: {
    type: 'local',
    dest: './buildkit-cache' // Cache directory (defaults to ./buildkit-cache)
  }
}
```

**Pros:**
- Very fast (no network transfer)
- No external dependencies
- Free

**Cons:**
- Not shared across machines
- Takes up disk space
- Must be in .gitignore

---

### 5. Inline Cache

Embeds cache metadata directly in the final image.

```typescript
images: {
  registry: 'ghcr.io/myorg',
  tagStrategy: 'git-sha',
  cache: {
    type: 'inline'
  }
}
```

**Pros:**
- No separate cache storage needed
- Works automatically if you pull the image

**Cons:**
- Increases final image size
- Less efficient than registry cache
- Cache tied to specific image

---

## Per-App Cache Override

You can override global cache configuration for specific apps:

```typescript
export default defineConfig({
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
        // Disable cache completely for this app
        cache: false
      },
      ports: [{ name: 'http', port: 4000 }]
    },
    database: {
      // Inherits global registry cache configuration
      build: {
        type: 'dockerfile',
        context: './database',
        dockerfile: './database/Dockerfile'
      },
      ports: [{ name: 'postgres', port: 5432 }]
    }
  }
})
```

## Usage

1. **Enable BuildKit** (if not already enabled):
   ```bash
   export DOCKER_BUILDKIT=1
   ```

2. **Configure cache in `tsops.config.ts`**:
   ```typescript
   images: {
     registry: 'ghcr.io/myorg',
     tagStrategy: 'git-sha',
     cache: {
       type: 'registry',
       mode: 'max'
     }
   }
   ```

3. **Build as usual**:
   ```bash
   pnpm tsops build
   ```

On the first build, cache will be created and pushed. Subsequent builds will reuse cached layers, significantly speeding up the process.

## Cache Modes

- **`min`**: Only caches final image layers. Smaller cache size, but slower builds.
- **`max`**: Caches all intermediate layers. Larger cache size, but faster builds. **Recommended for monorepos.**

## Best Practices

1. **Use `mode: 'max'` for monorepos** with shared dependencies.
2. **Use registry cache for CI/CD pipelines** to share cache across runners.
3. **Use local cache for local development** to avoid network overhead.
4. **Add cache directories to `.gitignore`**:
   ```gitignore
   # Docker BuildKit cache
   buildkit-cache/
   */.buildkit-cache/
   ```

## How It Works

tsops integrates Docker BuildKit's `--cache-from` and `--cache-to` flags to enable remote caching:

```bash
# Example generated command
docker build \
  --cache-from type=registry,ref=ghcr.io/myorg/app:cache \
  --cache-to type=registry,ref=ghcr.io/myorg/app:cache,mode=max \
  --tag ghcr.io/myorg/app:abc123 \
  .
```

This allows Docker to:
1. Pull cache from the remote source before building
2. Reuse cached layers that haven't changed
3. Push updated cache after building

## Performance Impact

Typical improvements with remote caching:

| Scenario | Without Cache | With Registry Cache | Speedup |
|----------|---------------|---------------------|---------|
| First build | 5min | 5min | 1x |
| No changes | 4.5min | 30s | 9x |
| Small change | 4min | 1min | 4x |
| Dependency update | 3min | 1.5min | 2x |

## Troubleshooting

### Cache not being used

1. Ensure BuildKit is enabled: `export DOCKER_BUILDKIT=1`
2. Check registry permissions (read/write access required)
3. Verify cache reference exists in registry

### Build slower with cache

1. Check network speed to registry/S3
2. Try `mode: 'min'` instead of `mode: 'max'`
3. Consider using local cache for development

### Cache storage growing too large

1. Set up cache cleanup in CI (delete old cache tags)
2. Use `mode: 'min'` to reduce cache size
3. Implement cache retention policies in your registry

## Related Documentation

- [Docker BuildKit Cache Documentation](https://docs.docker.com/build/cache/backends/)
- [GitHub Actions Cache](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows)
- [AWS S3 for BuildKit Cache](https://docs.docker.com/build/cache/backends/s3/)

## Example Projects

See [`tsops.config.ts`](./tsops.config.ts) for complete examples of all cache strategies.
