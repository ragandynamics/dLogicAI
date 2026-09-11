import { spawnSync } from 'node:child_process';

const [, , mode = 'local'] = process.argv;

const target = mode === 'remote' ? '--remote' : '--local';
const command = process.platform === 'win32' ? process.env.COMSPEC || 'cmd.exe' : 'sh';
const args = process.platform === 'win32'
  ? ['/d', '/s', '/c', `pnpm exec wrangler d1 migrations apply dialogicai-db ${target}`]
  : ['-lc', `pnpm exec wrangler d1 migrations apply dialogicai-db ${target}`];

const result = spawnSync(command, args, {
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    CI: '1'
  }
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
