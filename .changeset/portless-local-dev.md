---
"tsops": major
"@tsops/core": major
"@tsops/node": major
"@tsops/k8": major
---

Add `tsops dev` with Portless-backed stable local URLs and worktree isolation. Local runtime helpers now consume `TSOPS_DEV_URLS` when present, while keeping the existing localhost fallback outside `tsops dev`.

Raise the supported Node.js runtime to Node 24+ across published packages.
