#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import process from 'process';
import { Command } from 'commander';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
import packageJson from '../package.json';
import { TsOps, BuildOptions, DeployOptions } from './core';
import type { TsOpsConfig } from '../types';

const DEFAULT_CONFIG_BASENAME = 'tsops.config';
let tsNodeRegistered = false;
const tsOpsCache = new Map<string, TsOps>();

const program = new Command();
program
  .name('tsops')
  .description('Stateless operations CLI powered by TsOps configuration')
  .version((packageJson as { version?: string }).version ?? '0.0.0')
  .option('-c, --config <path>', 'Path to tsops config file', `${DEFAULT_CONFIG_BASENAME}.ts`);

function handleError(error: unknown): void {
  if (error instanceof Error) {
    console.error(`[tsops] ${error.message}`);
  } else {
    console.error('[tsops] Unknown error', error);
  }
  process.exitCode = 1;
}

const collectKeyValue = (value: string, previous?: string[]): string[] => {
  const list = previous ? [...previous] : [];
  list.push(value);
  return list;
};

const parseKeyValuePairs = (pairs: string[] | undefined): Record<string, string> => {
  if (!pairs || pairs.length === 0) {
    return {};
  }

  return pairs.reduce<Record<string, string>>((acc, entry) => {
    const index = entry.indexOf('=');
    if (index === -1) {
      throw new Error(`Invalid env var specification "${entry}". Use KEY=VALUE format.`);
    }

    const key = entry.slice(0, index).trim();
    const value = entry.slice(index + 1);
    if (!key) {
      throw new Error(`Invalid env var specification "${entry}". Key is required.`);
    }

    acc[key] = value;
    return acc;
  }, {});
};

const resolveConfigPath = (inputPath: string): string => {
  const absoluteInput = path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(process.cwd(), inputPath);

  const candidates = [
    absoluteInput,
    `${absoluteInput}.ts`,
    `${absoluteInput}.js`,
    `${absoluteInput}.cjs`,
    `${absoluteInput}.mjs`,
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to locate config file at ${absoluteInput}`);
};

const ensureTsNode = async (): Promise<void> => {
  if (tsNodeRegistered) {
    return;
  }

  try {
    await import('ts-node');
    tsNodeRegistered = true;
  } catch (error) {
    throw new Error(
      'Failed to load ts-node. Install it by running "pnpm add -D ts-node" or provide a compiled config.',
    );
  }
};

const importConfigModule = async (configPath: string): Promise<TsOpsConfig> => {
  const extension = path.extname(configPath).toLowerCase();
  if (extension === '.ts' || extension === '.tsx') {
    await ensureTsNode();
  }

  let imported: unknown;
  if (extension === '.mjs' || extension === '.mts' || extension === '.cjs' || extension === '.js') {
    const moduleUrl = pathToFileURL(configPath).href;
    imported = await import(moduleUrl);
  } else if (extension === '.ts' || extension === '.tsx') {
    const requireModule = createRequire(configPath);
    imported = requireModule(configPath);
  } else {
    const requireModule = createRequire(configPath);
    imported = requireModule(configPath);
  }

  const resolved =
    typeof imported === 'object' && imported !== null && 'default' in imported
      ? (imported as { default: TsOpsConfig }).default
      : imported;

  const config = resolved as TsOpsConfig | undefined;
  if (!config) {
    throw new Error(`Config module at ${configPath} does not export a configuration object.`);
  }

  return config;
};

const getTsOps = async (configPathInput: string): Promise<TsOps> => {
  const resolvedPath = resolveConfigPath(configPathInput);
  const cached = tsOpsCache.get(resolvedPath);
  if (cached) {
    return cached;
  }

  const config = await importConfigModule(resolvedPath);
  const instance = new TsOps(config, { cwd: process.cwd() });
  tsOpsCache.set(resolvedPath, instance);
  return instance;
};

program
  .command('build <service>')
  .description('Run the build pipeline for a service')
  .option('-e, --environment <env>', 'Target environment for the build pipeline')
  .option('--env <key=value>', 'Inject environment variable (can be repeated)', collectKeyValue, [])
  .action(async (service: string, commandOptions: { environment?: string; env?: string[] }) => {
    try {
      const globalOptions = program.opts<{ config: string }>();
      const tsops = await getTsOps(globalOptions.config);

      const envVars = parseKeyValuePairs(commandOptions.env);
      const buildOptions: BuildOptions = {
        environment: commandOptions.environment,
        env: envVars,
      };

      await tsops.build(service, buildOptions);
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('test')
  .description('Run the configured test pipeline')
  .action(async () => {
    try {
      const globalOptions = program.opts<{ config: string }>();
      const tsops = await getTsOps(globalOptions.config);
      await tsops.test();
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('deploy <service>')
  .description('Run the deploy pipeline for a service')
  .option('-e, --environment <env>', 'Target environment name')
  .option('--diff', 'Run diff before deployment')
  .option('--diff-only', 'Run diff and skip deployment')
  .option('--skip-hooks', 'Skip before/after deploy hooks')
  .option('--no-notify', 'Disable notifications for this run')
  .option('--image-tag <tag>', 'Override the image tag used for manifest rendering')
  .action(
    async (
      service: string,
      commandOptions: {
        environment?: string;
        diff?: boolean;
        diffOnly?: boolean;
        skipHooks?: boolean;
        notify?: boolean;
        imageTag?: string;
      },
    ) => {
      try {
        const globalOptions = program.opts<{ config: string }>();
        const tsops = await getTsOps(globalOptions.config);

        const deployOptions: DeployOptions = {
          environment: commandOptions.environment,
          diff: commandOptions.diff || commandOptions.diffOnly,
          diffOnly: commandOptions.diffOnly,
          skipHooks: commandOptions.skipHooks,
          notify: commandOptions.notify,
          imageTag: commandOptions.imageTag,
        };

        await tsops.deploy(service, undefined, deployOptions);
      } catch (error) {
        handleError(error);
      }
    },
  );

program
  .command('deploy-all')
  .description('Run the deploy pipeline for all services defined in the config')
  .option('-e, --environment <env>', 'Target environment name')
  .option('--diff', 'Run diff before deployment')
  .option('--diff-only', 'Run diff and skip deployment')
  .option('--skip-hooks', 'Skip before/after deploy hooks')
  .option('--no-notify', 'Disable notifications for this run')
  .option('--image-tag <tag>', 'Override the image tag used for manifest rendering')
  .option('--build', 'Run build pipeline for each service before deploying')
  .action(
    async (commandOptions: {
      environment?: string;
      diff?: boolean;
      diffOnly?: boolean;
      skipHooks?: boolean;
      notify?: boolean;
      imageTag?: string;
      build?: boolean;
    }) => {
      try {
        const globalOptions = program.opts<{ config: string }>();
        const tsops = await getTsOps(globalOptions.config);

        const gitInfo = await tsops.getGitInfo().catch((error) => {
          handleError(error);
          throw error;
        });

        if (commandOptions.build) {
          await tsops.buildAll(commandOptions.environment, {
            environment: commandOptions.environment,
            git: gitInfo,
          });
        }

        const deployOptions: DeployOptions = {
          environment: commandOptions.environment,
          diff: commandOptions.diff || commandOptions.diffOnly,
          diffOnly: commandOptions.diffOnly,
          skipHooks: commandOptions.skipHooks,
          notify: commandOptions.notify,
          imageTag: commandOptions.imageTag,
          git: gitInfo,
        };

        await tsops.deployAll(commandOptions.environment, deployOptions);
      } catch (error) {
        handleError(error);
      }
    },
  );

program.parseAsync(process.argv).catch((error) => {
  handleError(error);
});
