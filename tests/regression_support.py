"""Exclusive, disposable PostGIS lifespan shared by API and browser suites."""
import os
from contextlib import asynccontextmanager

import asyncpg
from sqlalchemy.engine import make_url


@asynccontextmanager
async def isolated_lifespan(application):
    from app.main import lifespan
    from app.db import Base, engine

    url = os.environ.get('TEST_DATABASE_URL', '')
    if not url or make_url(url).database != 'iot_regression_test':
        raise RuntimeError('Refusing reset: TEST_DATABASE_URL must name iot_regression_test')
    if engine.url != make_url(url):
        raise RuntimeError('Refusing reset: application engine differs from TEST_DATABASE_URL')
    connection = await asyncpg.connect(url.replace('postgresql+asyncpg://', 'postgresql://'))
    try:
        if not await connection.fetchval('SELECT pg_try_advisory_lock(782014269)'):
            raise RuntimeError('Another harness is using the regression database; retry after it finishes')
        async with engine.begin() as transaction:
            await transaction.run_sync(Base.metadata.drop_all)
        async with lifespan(application):
            yield
    finally:
        await connection.close()
