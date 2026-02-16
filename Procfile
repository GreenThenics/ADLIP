release: python scripts/import_patterns.py
web: gunicorn -w 4 -b 0.0.0.0:$PORT "app:create_app()"
worker: celery -A app.celery_app:celery worker --loglevel=info
