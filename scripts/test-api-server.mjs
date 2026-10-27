import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { python, testEnv, requireTestDatabase } from './test-env.mjs';

requireTestDatabase();
const cwd = mkdtempSync(join(tmpdir(), 'iot-e2e-'));
const child = spawn(python, [resolve(import.meta.dirname, '../tests/e2e_server.py')], {
  cwd, env: testEnv(), stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { rmSync(cwd, { recursive: true, force: true }); process.exitCode = code ?? 1; });
