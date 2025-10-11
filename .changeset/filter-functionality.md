---
'@tsops/cli': minor
'@tsops/core': minor
---

Add --filter flag to build and deploy commands for incremental deployments

This change introduces the ability to filter which apps to build or deploy based on git changes, enabling more efficient CI/CD pipelines by only processing apps affected by code changes.

**Features:**
- `tsops build --filter <git-ref>`: Build only apps with changed files compared to a git reference
- `tsops deploy --filter <git-ref>`: Deploy only apps with changed files compared to a git reference
- Support for any git reference (HEAD^1, main, origin/main, etc.)
- Automatic detection of affected apps based on build context paths
- Combined with existing filters (--namespace, --app)

**Implementation:**
- Extended `Planner.plan()` to accept `changedFiles` parameter
- Extended `Deployer.deploy()` and `Deployer.planWithChanges()` to support filtering by changed files
- CLI now uses `GitAdapter.getChangedFiles()` to detect changes when --filter is specified
- App filter (--app) takes precedence over --filter when both are provided

**Examples:**
```bash
# Build only apps changed since last commit
tsops build --filter HEAD^1

# Deploy only apps changed compared to main branch
tsops deploy --filter main

# Build changed apps in specific namespace
tsops build --filter origin/main --namespace prod
```
