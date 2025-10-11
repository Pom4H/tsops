---
'@tsops/cli': minor
'@tsops/core': minor
'@tsops/node': minor
---

Add --git flag to build and deploy commands for incremental deployments

This change introduces the ability to filter which apps to build or deploy based on git changes, enabling more efficient CI/CD pipelines by only processing apps affected by code changes.

**Features:**
- `tsops build --git <git-ref>`: Build only apps with changed files compared to a git reference
- `tsops deploy --git <git-ref>`: Deploy only apps with changed files compared to a git reference
- Support for any git reference (HEAD^1, main, origin/main, etc.)
- Automatic detection of affected apps based on build context paths
- Combined with existing filters (--namespace, --app)
- Git SHA now includes `-dirty` suffix when there are uncommitted changes

**Implementation:**
- Extended `Planner.plan()` to accept `changedFiles` parameter
- Extended `Deployer.deploy()` and `Deployer.planWithChanges()` to support filtering by changed files
- CLI now uses `GitAdapter.getChangedFiles()` to detect changes when `--git` is specified
- App filter (--app) takes precedence over `--git` when both are provided
- Git SHA automatically appends `-dirty` suffix for uncommitted changes

**Examples:**
```bash
# Build only apps changed since last commit
tsops build --git HEAD^1

# Deploy only apps changed compared to main branch
tsops deploy --git main

# Build changed apps in specific namespace
tsops build --git origin/main --namespace prod

# Git SHA with uncommitted changes
# Image tag: ghcr.io/org/app:abc123def456-dirty
```
