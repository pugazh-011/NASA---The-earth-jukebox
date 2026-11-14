"""Development entry point:  python backend/run.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app import create_app  # noqa: E402
from app.config import Config  # noqa: E402

if __name__ == "__main__":
    cfg = Config.from_env()
    create_app(cfg).run(host=cfg.host, port=cfg.port, debug=cfg.debug)
