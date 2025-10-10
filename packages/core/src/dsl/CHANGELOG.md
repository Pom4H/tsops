# Dynamic Infrastructure DSL - Changelog

## 2025-10-10 - Initial Implementation

### Features

- **Branded Types System** (`brands.ts`)
  - `FQDN` - Fully Qualified Domain Names with compile-time validation
  - `Host` - Host names (subdomains of FQDNs)
  - `Path` - URL paths (must start with `/`)
  - `Port` - Port numbers (1-65535)
  - `Url` - Complete URLs with protocol, host, and path
  - `SecretRefString` - Secret references in `secret://namespace/key` format
  - `ImageTag` - Git SHA or semantic version tags
  
- **Core Facts Types** (`core.ts`)
  - `Regions` - Map of region names to root FQDNs
  - `Namespaces` - Map of namespaces with region assignments
  - `Clusters` - Kubernetes clusters with assigned namespaces
  - `Services` - Service definitions with networking and dependencies
  - Type-level computations for deriving hosts, domains, and endpoints

- **Type-Level Validators** (`validators.ts`)
  - `NoCycle` - Prevents circular service dependencies
  - `DistinctHosts` - Ensures unique hosts across namespaces
  - `CheckIngressTLS` - Validates TLS configuration (letsencrypt vs custom)
  - `RequireSecretsInProd` - Enforces secretRefs for required env vars

- **Typed Helpers** (`helpers.ts`)
  - `hostFor(ns, subdomain)` - Generate valid hosts for namespaces
  - `path(p)` - Create validated paths
  - `url(proto, host, path)` - Build complete URLs
  - `env.require/optional` - Define environment variables with policies
  - `env.nextPublicFor` - Auto-generate NEXT_PUBLIC_* vars
  - `validate.*` - Runtime validators matching type-level guarantees

- **Runtime Implementation** (`runtime.ts`)
  - Helpers implementation with actual runtime validation
  - Cycle detection in service dependency graphs
  - Host uniqueness validation
  - TLS policy enforcement

- **DSL Definition** (`index.ts`)
  - `defineDSL` - Main configuration function
  - `resolveDSL` - Evaluate dynamic sections
  - `getExternalEndpoint` - Get public URLs for services
  - `getInternalEndpoint` - Get cluster-internal DNS names

### Architecture Principles

1. **Type as Rule**: All infrastructure rules are encoded as TypeScript types
2. **Facts → Invariants**: Minimal input data, maximum compile-time derivations
3. **Dynamic Sections**: Late-bound configuration using typed helpers
4. **Zero Runtime Overhead**: All validation happens at compile time (with runtime checks for safety)
5. **Progressive Disclosure**: Start simple, add validators as needed

### Example Usage

See `/examples/dynamic-dsl/tsops.config.ts` for a complete working example demonstrating:
- Multi-region setup (worken.ai, worken.ru)
- Service dependency validation (no cycles)
- Environment variable policies
- Ingress/TLS configuration
- Auto-generated public environment variables

### Integration

The DSL is fully integrated with the existing tsops system:
- Exported from `@tsops/core`
- Separate namespace to avoid conflicts with existing types
- Compatible with existing tsops configuration patterns
- Can be used standalone or integrated into tsops workflows

### Future Enhancements

Potential areas for extension:
- Image tag policies (gitsha, semver validation)
- Resource limit validators for production
- Network policy generation
- Monitoring/observability configuration
- Multi-cloud support (AWS, GCP, Azure)
