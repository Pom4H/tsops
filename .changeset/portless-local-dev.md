---
"tsops": minor
"@tsops/core": minor
"@tsops/node": minor
"@tsops/k8": minor
---

Add `tsops dev` with Portless-backed stable local URLs and worktree isolation. Local runtime helpers now consume `TSOPS_DEV_URLS` when present, while keeping the existing localhost fallback outside `tsops dev`.

Raise the supported Node.js runtime to Node 24+ across published packages.
