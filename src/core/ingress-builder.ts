import type {
  EnvironmentConfig,
  IngressManifest,
  KubernetesManifest,
  ServiceConfig,
  ServiceManifest,
} from '../types';

export class IngressBuilder {
  appendIngressManifests(
    baseManifests: KubernetesManifest[],
    service: ServiceConfig & { name: string },
    environment: EnvironmentConfig & { name: string },
  ): KubernetesManifest[] {
    const ingressManifests = this.buildIngressManifests(
      baseManifests,
      service,
      environment,
    );

    return ingressManifests.length > 0
      ? [...baseManifests, ...ingressManifests]
      : baseManifests;
  }

  private buildIngressManifests(
    baseManifests: KubernetesManifest[],
    service: ServiceConfig & { name: string },
    environment: EnvironmentConfig & { name: string },
  ): IngressManifest[] {
    const ingressConfig = service.ingress;
    if (!ingressConfig) {
      return [];
    }

    const baseContainsIngress = baseManifests.some(
      (manifest) => (manifest as { kind?: string }).kind === 'Ingress',
    );
    if (baseContainsIngress) {
      return [];
    }

    const serviceManifest = baseManifests.find(
      (manifest) => (manifest as { kind?: string }).kind === 'Service',
    ) as ServiceManifest | undefined;

    const defaultServicePort = serviceManifest?.spec.ports?.[0]?.name ??
      serviceManifest?.spec.ports?.[0]?.port;

    const manifests: IngressManifest[] = [];

    for (const [ingressKey, definition] of Object.entries(ingressConfig)) {
      if (!definition) {
        continue;
      }

      const entryPoints =
        definition.entryPoints ??
        (ingressKey === 'websecure' ? ['websecure'] : undefined);

      const tlsDefinitions =
        definition.tls ??
        (ingressKey === 'websecure'
          ? [
              {
                secretName: `${service.name}-tls`,
                hosts: Array.from(
                  new Set(definition.rules.map((rule) => rule.host)),
                ),
              },
            ]
          : undefined);

      const annotations: Record<string, string> = {
        ...(definition.annotations ?? {}),
      };
      if (entryPoints && entryPoints.length > 0) {
        annotations['traefik.ingress.kubernetes.io/router.entrypoints'] =
          entryPoints.join(',');
      }
      if (
        definition.className === 'traefik' &&
        tlsDefinitions &&
        tlsDefinitions.length > 0 &&
        annotations['traefik.ingress.kubernetes.io/router.tls'] === undefined
      ) {
        annotations['traefik.ingress.kubernetes.io/router.tls'] = 'true';
      }

      const rules = definition.rules.map((rule) => {
        const paths = rule.paths.map((pathConfig) => {
          const resolvedPort =
            pathConfig.servicePort ?? defaultServicePort;
          if (resolvedPort === undefined) {
            throw new Error(
              `Ingress definition "${ingressKey}" for service "${service.name}" is missing a servicePort and no default could be inferred.`,
            );
          }

          const portDefinition =
            typeof resolvedPort === 'number'
              ? { number: resolvedPort }
              : { name: resolvedPort };

          return {
            path: pathConfig.path ?? '/',
            pathType: pathConfig.pathType ?? 'Prefix',
            backend: {
              service: {
                name: service.name,
                port: portDefinition,
              },
            },
          };
        });

        return {
          host: rule.host,
          http: { paths },
        };
      });

      const ingressManifest: IngressManifest = {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'Ingress',
        metadata: {
          name: definition.name ?? `${service.name}-${ingressKey}`,
          namespace: environment.namespace,
          labels: { app: service.name },
          annotations:
            Object.keys(annotations).length > 0 ? annotations : undefined,
        },
        spec: {
          ingressClassName: definition.className,
          tls: tlsDefinitions,
          rules,
        },
      };

      manifests.push(ingressManifest);
    }

    return manifests;
  }
}
