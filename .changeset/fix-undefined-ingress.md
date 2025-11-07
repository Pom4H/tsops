---
'@tsops/core': patch
'tsops': patch
---

## Bug Fixes

### Fixed TypeError when ingress function returns undefined

Fixed a critical bug where `resolveNetwork` would crash with `TypeError: Cannot read properties of undefined (reading 'includes')` when:
- An app's `ingress` function returned `undefined` or `null`
- Runtime config was imported in any application (causing iteration over all apps including those without ingress)

**Before:**
```typescript
// This would crash the entire config import!
apps: {
  mastra: {
    ports: [...] // No ingress
  }
}
```

**After:**
```typescript
// Now safely handles apps without ingress
apps: {
  mastra: {
    ports: [...] // No ingress - works fine!
  }
}
```

**Changes:**
- Added validation in `resolveNetwork` to check if `resolved` object exists before accessing properties
- Added proper error handling in `dns()` helper when requesting ingress DNS for apps without ingress configuration
- Returns clear error message: `Cannot get ingress DNS for app "X": no ingress configuration found`

**Tests:**
- Added test cases for apps without ingress
- Added test cases for conditional ingress that might return undefined
- All 6 tests passing

This fix is critical for production usage where config contains both public-facing apps (with ingress) and internal services (without ingress).

