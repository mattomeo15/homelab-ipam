#!/bin/sh
PORT="${PORT:-8000}"
exec python3 -m uvicorn backend.app.main:app --host 0.0.0.0 --port "$PORT"
