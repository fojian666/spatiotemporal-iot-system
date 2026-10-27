"""Create ONLY the named disposable regression DB. Never drops an existing DB."""
import asyncio
import os

import asyncpg
from sqlalchemy.engine import make_url


async def main():
    raw = os.environ.get('TEST_DATABASE_URL', '')
    if not raw or make_url(raw).database != 'iot_regression_test':
        raise SystemExit('TEST_DATABASE_URL must name iot_regression_test; refusing to continue')
    url = make_url(raw).set(drivername='postgresql')
    connection = await asyncpg.connect(url.set(database='postgres').render_as_string(hide_password=False))
    try:
        if not await connection.fetchval('SELECT 1 FROM pg_database WHERE datname=$1', 'iot_regression_test'):
            await connection.execute('CREATE DATABASE iot_regression_test')
    finally:
        await connection.close()
    connection = await asyncpg.connect(url.render_as_string(hide_password=False))
    try:
        await connection.execute('CREATE EXTENSION IF NOT EXISTS postgis')
    finally:
        await connection.close()
    print('Dedicated regression database ready')


asyncio.run(main())
