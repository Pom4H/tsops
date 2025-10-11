# Proposal: Workspace Dependencies Support for --git Filter

## Problem

Current `tsops build --git` and `tsops deploy --git` only detect direct changes in app directories.
They **do not** detect transitive changes in workspace dependencies.

### Example

```
monorepo/
├── packages/
│   ├── shared-lib/        <- Changed file here
│   │   └── src/utils.ts
│   └── ui-components/
│       └── src/Button.tsx
├── apps/
│   ├── backend/           <- Uses @monorepo/shared-lib
│   │   ├── package.json   <- "dependencies": { "@monorepo/shared-lib": "workspace:*" }
│   │   └── src/
│   └── frontend/          <- Uses @monorepo/shared-lib AND @monorepo/ui-components
│       ├── package.json   <- "dependencies": { "@monorepo/shared-lib": "workspace:*", ... }
│       └── src/
```

**Current behavior:**
```bash
# Change shared-lib/src/utils.ts
git add packages/shared-lib/src/utils.ts
git commit -m "fix: update utils"

# Try to build affected apps
tsops build --git HEAD^1

# ❌ Result: "No apps affected by changed files"
# ❌ Should rebuild: backend, frontend (they depend on shared-lib)
```

## Solution Options

### Option 1: Simple Pattern Matching (Quick Win)

Add heuristic rules for common monorepo patterns:

```typescript
// If any of these change, rebuild ALL apps:
const globalDependencies = [
  'packages/',      // All shared packages
  'libs/',          // Alternative naming
  'shared/',
  'common/',
  'package.json',   // Root package.json changes
  'pnpm-lock.yaml', // Lockfile changes
  'yarn.lock',
  'package-lock.json'
]
```

**Pros:**
- Simple to implement (5 minutes)
- Works for most monorepos
- No external dependencies

**Cons:**
- Not precise (rebuilds everything)
- False positives
- Doesn't respect actual dependency graph

### Option 2: Package.json Analysis (Recommended)

Parse `package.json` files to build actual dependency graph:

```typescript
interface WorkspaceDependency {
  name: string        // e.g., "@monorepo/shared-lib"
  version: string     // e.g., "workspace:*"
  path: string        // e.g., "packages/shared-lib"
}

function analyzeWorkspaceDependencies(appContext: string): string[] {
  // 1. Read package.json from appContext
  // 2. Extract dependencies with "workspace:" protocol
  // 3. Resolve workspace paths from pnpm-workspace.yaml / package.json workspaces
  // 4. Return list of dependency paths
}
```

**Pros:**
- Accurate dependency tracking
- Only rebuilds affected apps
- Respects monorepo structure

**Cons:**
- Need to parse package.json (requires fs access in core)
- Need to resolve workspace paths
- More complex implementation

### Option 3: Integration with Turbo/Rush/Nx (Future)

Use existing monorepo tools' dependency graphs:

```typescript
// Read turbo.json
const turboDeps = await analyzeTurboDependencies()

// Or use turbo CLI
const affected = execSync('turbo run build --filter=[HEAD^1] --dry=json')
```

**Pros:**
- Leverages existing tooling
- Supports complex dependency graphs
- Industry standard

**Cons:**
- Requires external tool installation
- Different tools for different monorepos
- Additional complexity

## Recommended Implementation Plan

### Phase 1: Simple Patterns (Immediate)

Add config option for workspace patterns:

```typescript
// tsops.config.ts
export default defineConfig({
  project: 'my-monorepo',
  
  // New option
  workspaces: {
    globalDependencies: [
      'packages/',
      'libs/',
      'pnpm-lock.yaml'
    ]
  },
  
  apps: {
    backend: {
      build: {
        context: 'apps/backend',
        // New option: explicit dependencies
        dependencies: ['packages/shared-lib', 'packages/api-client']
      }
    }
  }
})
```

Implementation:
```typescript
function selectByChangedFiles(changedFiles: string[]): AppEntry<TConfig>[] {
  // Step 1: Check global dependencies
  const hasGlobalChange = changedFiles.some(file => 
    config.workspaces?.globalDependencies?.some(pattern => 
      file.startsWith(pattern)
    )
  )
  
  if (hasGlobalChange) {
    return entries // Return ALL apps
  }
  
  // Step 2: Check direct changes
  const affected = new Set<string>()
  for (const [appName, app] of entries) {
    // ... existing logic ...
    
    // Step 3: Check explicit dependencies
    if (app.build?.dependencies) {
      const hasDepChange = changedFiles.some(file =>
        app.build.dependencies.some(dep => file.startsWith(dep))
      )
      if (hasDepChange) affected.add(appName)
    }
  }
  
  return Array.from(affected)
}
```

### Phase 2: Package.json Analysis (Next)

Implement automatic dependency resolution:

1. Read `pnpm-workspace.yaml` / `package.json` workspaces
2. Build workspace name → path mapping
3. Parse each app's `package.json`
4. Resolve workspace dependencies to paths
5. Check if changed files affect those paths

### Phase 3: Tool Integration (Future)

Add support for existing monorepo tools:

```typescript
// tsops.config.ts
export default defineConfig({
  workspaces: {
    tool: 'turbo', // or 'nx', 'rush'
    // Use tool's dependency graph
  }
})
```

## Configuration API Proposal

```typescript
interface WorkspacesConfig {
  /**
   * Directories that affect all apps when changed
   * @default []
   */
  globalDependencies?: string[]
  
  /**
   * Automatic dependency resolution from package.json
   * @default true if pnpm-workspace.yaml or package.json workspaces exist
   */
  analyzeDependencies?: boolean
  
  /**
   * Monorepo tool integration
   */
  tool?: 'turbo' | 'nx' | 'rush' | 'none'
}

interface BuildConfig {
  type: 'dockerfile'
  context: string
  dockerfile: string
  
  /**
   * Explicit dependencies (paths relative to repo root)
   * When files in these directories change, this app should rebuild
   */
  dependencies?: string[]
}
```

## Testing Strategy

```typescript
describe('selectByChangedFiles with workspaces', () => {
  it('rebuilds apps when workspace dependency changes', () => {
    // Given: backend depends on shared-lib
    // When: shared-lib/utils.ts changes
    // Then: backend should be affected
  })
  
  it('respects explicit dependencies', () => {
    // Given: app.build.dependencies = ['packages/api-client']
    // When: packages/api-client/index.ts changes
    // Then: app should be affected
  })
  
  it('rebuilds all apps when global dependency changes', () => {
    // Given: globalDependencies = ['packages/']
    // When: packages/shared-lib/utils.ts changes
    // Then: ALL apps should be affected
  })
})
```

## Migration Path

1. **Now (Phase 1)**: Add explicit `dependencies` field to `build` config
2. **Next sprint**: Implement package.json analysis
3. **Future**: Add tool integration

Users can start with explicit dependencies immediately:

```typescript
apps: {
  backend: {
    build: {
      context: 'apps/backend',
      dependencies: ['packages/shared-lib'] // ← Add this
    }
  }
}
```

## Questions for Discussion

1. Should global dependencies rebuild ALL apps by default?
2. How to handle `pnpm-lock.yaml` / lockfile changes?
3. Should we support glob patterns in dependencies?
4. Do we need to analyze devDependencies or just dependencies?
5. How to handle peer dependencies?

## Next Steps

1. Implement Phase 1 (explicit dependencies + global patterns)
2. Write tests for workspace dependency scenarios
3. Update documentation with examples
4. Gather feedback from users
5. Plan Phase 2 implementation
