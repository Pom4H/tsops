import { createConfigResolver } from "./config/resolver.js";
import { getEnvironmentVariable } from "./environment-provider.js";
import type {
  DNSType,
  ExtractNamespaceVarsFromConfig,
  TsOpsConfig,
} from "./types.js";

/**
 * Creates runtime helper functions for a specific namespace
 */
export function createRuntimeHelpers<
  TConfig extends TsOpsConfig<any, any, any, any, any, any, any>
>(config: TConfig, namespace: Extract<keyof TConfig["namespaces"], string>) {
  const resolver = createConfigResolver(config);
  const namespaceVars = config.namespaces[
    namespace
  ] as ExtractNamespaceVarsFromConfig<TConfig>;

  // Collect all external hosts with protocol and port information
  const externalHosts: Record<string, string> = {};
  const externalProtocols: Record<string, "http" | "https"> = {};
  const externalPorts: Record<string, number> = {};
  const appsConfig: Record<string, any> = {};

  const appEntries = resolver.apps.select();
  for (const [appName, app] of appEntries) {
    // Store app config for all apps (needed for port() helper)
    appsConfig[appName] = app;

    if (!resolver.apps.shouldDeploy(app, namespace as string)) {
      continue;
    }

    // Create temporary context to resolve ingress
    const tempContext = resolver.namespaces.createHostContext(
      namespace as string,
      { appName }
    );

    // Resolve ingress to get external host, protocol, and port
    const { host, protocol, port } = resolver.apps.resolveNetwork(
      appName,
      app,
      tempContext
    );

    if (host) {
      externalHosts[appName] = host;
      // Store protocol, default to http if not specified
      externalProtocols[appName] = protocol || "http";
      // Store port if specified (for local development)
      if (port) {
        externalPorts[appName] = port;
      }
    }
  }

  /**
   * Get the target port for an app (internal helper)
   * Returns undefined if ports are not configured
   */
  const getAppTargetPort = (
    app: Extract<keyof TConfig["apps"], string>
  ): number | undefined => {
    const appConfig = appsConfig[app];
    if (!appConfig) return undefined;

    // Resolve ports (can be static or function)
    const tempContext = resolver.namespaces.createHostContext(
      namespace as string,
      { appName: app }
    );
    const resolvedPorts =
      typeof appConfig.ports === "function"
        ? appConfig.ports(tempContext)
        : appConfig.ports;

    if (!resolvedPorts || resolvedPorts.length === 0) return undefined;

    const firstPort = resolvedPorts[0];

    // If port is a string like "80:3000", extract targetPort (3000)
    if (typeof firstPort.port === "string") {
      const parts = firstPort.port.split(":");
      if (parts.length === 2) {
        return parseInt(parts[1], 10);
      }
      return parseInt(firstPort.port, 10);
    }

    // If targetPort is explicitly defined, use it
    if (firstPort.targetPort !== undefined) {
      return typeof firstPort.targetPort === "string"
        ? parseInt(firstPort.targetPort, 10)
        : firstPort.targetPort;
    }

    // Otherwise, use port (which equals targetPort)
    return firstPort.port;
  };

  /**
   * Check if we're in local development mode (explicit local flag in namespace)
   */
  const isLocalDevelopment = (
    _app?: Extract<keyof TConfig["apps"], string>
  ): boolean => {
    // Check explicit local flag in namespace configuration
    const namespaceConfig =
      config.namespaces[
        namespace as Extract<keyof TConfig["namespaces"], string>
      ];
    return namespaceConfig?.local === true;
  };

  /**
   * Generate DNS name for different types of resources.
   * In local mode, both service and ingress use localhost.
   * In production, service uses app name, ingress uses configured domain.
   */
  const dns = (
    app: Extract<keyof TConfig["apps"], string>,
    type: DNSType
  ): string => {
    // In local mode, all types use localhost
    if (isLocalDevelopment()) {
      return "localhost";
    }

    // Production mode
    if (type === "service") {
      return app;
    }

    // type === "ingress"
    if (!externalHosts[app]) {
      throw new Error(
        `Cannot get ingress DNS for app "${app}": no ingress configuration found. ` +
          `Add an ingress definition to the app or use 'service' type instead.`
      );
    }

    return externalHosts[app];
  };

  /**
   * Generate complete URL for different types of resources.
   * Service URLs always include targetPort (for k8s service routing).
   * Ingress URLs include port only if explicitly configured (e.g., localhost:3001).
   */
  const url = (
    app: Extract<keyof TConfig["apps"], string>,
    type: DNSType
  ): string => {
    const hostname = dns(app, type);
    const protocol =
      type === "ingress" ? externalProtocols[app] || "http" : "http";

    // Determine port based on type
    const portNumber =
      type === "ingress"
        ? externalPorts[app] // Explicit port from ingress config (optional)
        : getAppTargetPort(app); // Service always uses targetPort (required)

    const port = portNumber ? `:${portNumber}` : "";
    return `${protocol}://${hostname}${port}`;
  };

  /**
   * Get the port number for an app.
   * Returns the actual port the application should listen on (targetPort).
   * For local development, this returns the unique port per service.
   * For production, this typically returns the standard container port.
   */
  const port = (app: Extract<keyof TConfig["apps"], string>): number => {
    const targetPort = getAppTargetPort(app);

    if (targetPort === undefined) {
      throw new Error(
        `Cannot get port for app "${app}": no ports configuration found. ` +
          `Add a ports definition to the app configuration.`
      );
    }

    return targetPort;
  };

  /**
   * Get environment variable for an app.
   * Implementation reads directly from process.env via global provider.
   * The appName argument is accepted for API consistency but not used here.
   */
  const env = (
    _appName: Extract<keyof TConfig["apps"], string>,
    key: string
  ): string => {
    return getEnvironmentVariable(key) ?? "";
  };

  return {
    dns,
    url,
    port,
    env,
  };
}
