import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const root = resolve(import.meta.dirname, '..');
export const python = process.env.TEST_PYTHON || (existsSync(resolve(root, 'backend/.venv/bin/python')) ? resolve(root, 'backend/.venv/bin/python') : 'python3');

export function testEnv() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('IOT_')));
  return {
    ...env,
    PYTHONPATH: resolve(root, 'backend'),
    IOT_DATABASE_URL: process.env.TEST_DATABASE_URL || '',
    IOT_JWT_SECRET: 'regression-only-secret-never-used-outside-tests',
    IOT_ADMIN_PASSWORD: 'regression-admin-only',
    IOT_OPERATOR_PASSWORD: 'regression-operator-only',
    IOT_VIEWER_PASSWORD: 'regression-viewer-only',
    IOT_MQTT_ENABLED: 'false', IOT_MQTT_TLS: 'false', IOT_LLM_ENABLED: 'false',
    IOT_TLS_ENABLED: 'false', TZ: 'Asia/Shanghai',
    IOT_CORS_ORIGINS: JSON.stringify(['http://127.0.0.1:4176']),
  };
}

export function requireTestDatabase() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || new URL(url).pathname !== '/iot_regression_test') {
    throw new Error('Set TEST_DATABASE_URL=postgresql+asyncpg://USER@127.0.0.1:5432/iot_regression_test (dedicated disposable database only).');
  }
}
