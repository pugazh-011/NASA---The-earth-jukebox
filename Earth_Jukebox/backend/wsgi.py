"""Production entry point, e.g.  waitress-serve --listen=0.0.0.0:8000 wsgi:app
(on Linux/macOS you can use gunicorn: gunicorn wsgi:app)."""
from app import create_app

app = create_app()
