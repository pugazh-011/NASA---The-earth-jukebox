"""Central configuration. Override any path with an environment variable."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Config:
    data_file: Path = PROJECT_ROOT / "data" / "nasa_enso.csv"
    metadata_file: Path = PROJECT_ROOT / "data" / "metadata.json"
    frontend_dir: Path = PROJECT_ROOT / "frontend"
    host: str = "127.0.0.1"
    port: int = 5000
    debug: bool = False

    @classmethod
    def from_env(cls) -> "Config":
        d = cls()
        return cls(
            data_file=Path(os.getenv("EJ_DATA_FILE", d.data_file)),
            metadata_file=Path(os.getenv("EJ_METADATA_FILE", d.metadata_file)),
            frontend_dir=Path(os.getenv("EJ_FRONTEND_DIR", d.frontend_dir)),
            host=os.getenv("EJ_HOST", d.host),
            port=int(os.getenv("EJ_PORT", d.port)),
            debug=os.getenv("EJ_DEBUG", "0") == "1",
        )
