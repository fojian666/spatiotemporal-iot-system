"""Launched only by Playwright; temporary cwd prevents loading developer .env."""
import uvicorn
from app.main import app
from regression_support import isolated_lifespan

app.router.lifespan_context = isolated_lifespan
uvicorn.run(app, host='127.0.0.1', port=8020, log_level='warning')
