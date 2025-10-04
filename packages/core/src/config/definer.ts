import type {
  NamespaceDefinition,
  ClusterDefinition,
  ImagesConfig,
  AppDefinition,
  TsOpsConfig,
  ExtractNamespaceVars
} from '../types'

export function defineConfig<
  const TProject extends string,
  const TNamespaces extends Record<string, NamespaceDefinition>,
  const TClusters extends Record<string, ClusterDefinition<Extract<keyof TNamespaces, string>>>,
  const TImages extends ImagesConfig,
  const TSecrets extends Record<string, unknown> | undefined,
  const TConfigMaps extends Record<string, unknown> | undefined,
  const TApps extends Record<string, AppDefinition<ExtractNamespaceVars<TNamespaces>, TProject, Extract<keyof TNamespaces, string>, TSecrets, TConfigMaps, TApps>>
>(
  config: TsOpsConfig<TProject, TNamespaces, TClusters, TImages, TApps, TSecrets, TConfigMaps>
): TsOpsConfig<TProject, TNamespaces, TClusters, TImages, TApps, TSecrets, TConfigMaps> {
  return config
}
