import { TsOps } from '../src/core';
import localConfig from '../tsops.local.config';
import type { GitInfo } from '../types';

const gitInfo: GitInfo = {
  branch: 'local-demo',
  sha: '0000000devlocal0000000',
  shortSha: 'devlocal',
  tag: undefined,
  hasUncommittedChanges: false,
};

async function main(): Promise<void> {
  const tsops = new TsOps(localConfig);

  await tsops.buildAll('local', { git: gitInfo });

  await tsops.deployAll('local', { git: gitInfo, notify: false });
}

main().catch((error) => {
  console.error('[local-deploy] deployment failed');
  console.error(error);
  process.exitCode = 1;
});
