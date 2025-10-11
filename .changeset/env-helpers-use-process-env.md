---
"@tsops/core": patch
---

fix(core): runtime env() now reads from process.env

- Update runtime helpers `config.env(app, key)` to return values from `process.env`
- Aligns with docs and expected runtime behavior
- Add tests to verify `config.env()` reads from `process.env`
