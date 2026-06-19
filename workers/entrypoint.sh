#!/bin/sh
python /app/health_server.py 8001 &
exec celery -A celery_app worker -Q "$CELERY_QUEUE" --concurrency="${CELERY_CONCURRENCY:-2}" --loglevel=info
