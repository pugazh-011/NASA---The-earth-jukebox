"""HTTP API (JSON). Thin layer: validate input, call repository, shape output."""
from __future__ import annotations

import json
import logging
from datetime import date

from flask import Blueprint, current_app, jsonify, request

from .repository import DatasetError, DatasetRepository

log = logging.getLogger(__name__)
api_bp = Blueprint("api", __name__)

PLACEHOLDER_PREFIX = "REPLACE_"


def _repo() -> DatasetRepository:
    return current_app.config["EJ_REPOSITORY"]


def _parse_iso_date(name: str) -> date | None:
    raw = request.args.get(name)
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise DatasetError(f"Invalid '{name}' date. Use YYYY-MM-DD.") from None


def _load_metadata() -> dict:
    path = current_app.config["EJ_CONFIG"].metadata_file
    if not path.exists():
        return {"metadata_status": "missing", "metadata_warnings": [f"{path.name} not found."]}
    try:
        meta = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return {"metadata_status": "invalid", "metadata_warnings": [f"{path.name} is not valid JSON: {exc}"]}

    warnings = [
        f"'{k}' still has a placeholder value."
        for k, v in meta.items()
        if isinstance(v, str) and v.startswith(PLACEHOLDER_PREFIX)
    ]
    if not meta.get("unit"):
        warnings.append("Unit has not been confirmed from the NASA documentation yet.")
    verification = meta.get("verification", {})
    if not verification.get("nasa_only_rule_checked"):
        warnings.append("NASA-only provenance has not been verified by the team yet.")
    meta["metadata_status"] = "ok" if not warnings else "incomplete"
    meta["metadata_warnings"] = warnings
    return meta


@api_bp.errorhandler(DatasetError)
def handle_dataset_error(err: DatasetError):
    return jsonify({"error": str(err)}), err.status


@api_bp.get("/health")
def health():
    try:
        rows = _repo().coverage()["rows"]
        return jsonify({"status": "ok", "dataset_loaded": True, "rows": rows})
    except DatasetError as exc:
        # 200 on purpose: the server is healthy, it is just waiting for data.
        return jsonify({"status": "waiting_for_data", "dataset_loaded": False, "message": str(exc)})


@api_bp.get("/metadata")
def metadata():
    info = _load_metadata()
    try:
        info.update(_repo().coverage())
        info["dataset_loaded"] = True
    except DatasetError as exc:
        info.update({"rows": 0, "dataset_loaded": False, "data_status": str(exc)})
    return jsonify(info)


@api_bp.get("/data")
def data():
    start = _parse_iso_date("start")
    end = _parse_iso_date("end")
    resample = request.args.get("resample", "none")

    repo = _repo()
    df = repo.query(start=start, end=end, resample=resample)
    observations = [
        {"date": d.strftime("%Y-%m-%d"), "value": float(v)}
        for d, v in zip(df["date"], df["value"])
    ]
    return jsonify(
        {
            "observations": observations,
            "count": len(observations),
            "summary": repo.summarise(df),
            "query": {
                "start": start.isoformat() if start else None,
                "end": end.isoformat() if end else None,
                "resample": resample,
                "note": (
                    "Values are the original NASA observations."
                    if resample == "none"
                    else f"Values are {resample} means of the original NASA observations."
                ),
            },
        }
    )
