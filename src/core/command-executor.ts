import { exec as execCallback, spawn } from 'child_process';
import { promisify } from 'util';

export interface CommandRunOptions {
  env?: Record<string, string>;
  input?: string;
}

const execAsync = promisify(execCallback);

export class CommandExecutor {
  constructor(private readonly cwd: string) {}

  async run(command: string, options: CommandRunOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, {
        cwd: this.cwd,
        shell: true,
        env: { ...process.env, ...(options.env ?? {}) },
        stdio: options.input ? ['pipe', 'inherit', 'inherit'] : 'inherit',
      });

      if (options.input) {
        child.stdin?.write(options.input);
        child.stdin?.end();
      }

      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with exit code ${code}: ${command}`));
        }
      });
    });
  }

  async capture(
    command: string,
    options: CommandRunOptions = {},
  ): Promise<{ stdout: string; stderr: string }> {
    return execAsync(command, {
      cwd: this.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
    });
  }
}
