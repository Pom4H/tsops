---
"@tsops/core": patch
"tsops": patch
---

Escape shell-sensitive SQL in built-in PostgreSQL drop-schema jobs so dollar-quoted
guards run correctly through `/bin/sh -c`.
