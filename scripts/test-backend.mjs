import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { python, root, testEnv, requireTestDatabase } from './test-env.mjs';

const unitOnly = process.argv.includes('--unit');
if (!unitOnly) requireTestDatabase();
// An empty cwd prevents pydantic-settings from loading any developer .env.
const cwd = mkdtempSync(join(tmpdir(), 'iot-regression-'));
try {
  const result = spawnSync(python, ['-m', 'pytest', '-c', resolve(root, 'pytest.ini'), resolve(root, 'tests/backend'),
    ...(unitOnly ? ['-m', 'not integration'] : []), '--cov=app', ...(unitOnly ? [] : ['--cov-fail-under=80']), '--cov-report=term-missing', `--cov-report=xml:${resolve(root, 'coverage/backend.xml')}`],
    { cwd, env: testEnv(), stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { rmSync(cwd, { recursive: true, force: true }); }
