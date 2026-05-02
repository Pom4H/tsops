---
"@tsops/core": patch
"tsops": patch
---

Do not require generated runtime database Secrets for built-in drop-schema jobs;
the drop SQL only needs lifecycle credentials and resolved metadata.
