import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { root } from './test-env.mjs';

const mode = process.argv[2];
if (!['local', 'api'].includes(mode)) throw new Error('Expected local or api');
const vite = resolve(root, 'node_modules/vite/bin/vite.js');
const out = resolve(root, 'node_modules/.cache/iot-regression', mode);
const env = { ...process.env, VITE_DATA_SOURCE: mode, VITE_API_BASE_URL: 'http://127.0.0.1:8020' };
const build = spawnSync(process.execPath, [vite, 'build', '--outDir', out, '--emptyOutDir'], { cwd: root, env, stdio: 'inherit' });
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);
const child = spawn(process.execPath, [vite, 'preview', '--outDir', out, '--host', '127.0.0.1', '--port', mode === 'local' ? '4175' : '4176', '--strictPort'], { cwd: root, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
