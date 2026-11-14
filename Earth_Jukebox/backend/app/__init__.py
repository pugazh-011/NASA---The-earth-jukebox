"""Earth Jukebox backend package (Flask application factory)."""
from __future__ import annotations

import logging
from pathlib import Path

from flask import Flask, jsonify, send_from_directory

from .api import api_bp
from .config import Config
from .repository import DatasetRepository


def create_app(config: Config | None = None) -> Flask:
    """Build and configure the Flask app. Tests pass in their own Config."""
    config = config or Config.from_env()
    logging.basicConfig(
        level=logging.DEBUG if config.debug else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    app = Flask(
        __name__,
        static_folder=str(config.frontend_dir),
        static_url_path="/static",
    )
    app.config["EJ_CONFIG"] = config
    app.config["EJ_REPOSITORY"] = DatasetRepository(config.data_file)
    app.register_blueprint(api_bp, url_prefix="/api")

    @app.get("/")
    def index():
        return send_from_directory(Path(config.frontend_dir), "index.html")

    @app.after_request
    def add_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        if response.mimetype == "application/json":
            response.headers["Cache-Control"] = "no-cache"
        return response

    @app.errorhandler(404)
    def not_found(_err):
        return jsonify({"error": "Not found."}), 404

    @app.errorhandler(500)
    def server_error(_err):
        return jsonify({"error": "Internal server error."}), 500

    return app
