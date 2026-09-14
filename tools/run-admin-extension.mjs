import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const sourceDir = '.output-admin/chrome-mv3-admin';
const manifest = JSON.parse(await readFile(path.join(sourceDir, 'manifest.json'), 'utf8'));
const bridge = manifest.content_scripts?.find((entry) =>
  entry.js?.some((file) => file.includes('admin-handoff')),
);
const match = bridge?.matches?.[0];
if (typeof match !== 'string' || !match.endsWith('/*')) {
  throw new Error('Admin dashboard origin is missing from the admin extension manifest');
}

const dashboardUrl = `${match.slice(0, -2)}/lectio-sessions`;
const executable = path.resolve('node_modules/.bin/web-ext');
const child = spawn(executable, [
  'run',
  '--target',
  'chromium',
  '--source-dir',
  sourceDir,
  '--start-url',
  dashboardUrl,
], { stdio: 'inherit' });

child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
