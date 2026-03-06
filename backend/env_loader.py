"""
Local .env loader without external dependencies.

Loads values from:
1) backend/.env
2) project_root/.env

Existing process environment variables always take precedence.
"""
from __future__ import annotations

import os
from pathlib import Path


_LOADED = False


def _strip_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def _parse_line(line: str) -> tuple[str, str] | None:
    entry = line.strip()
    if not entry or entry.startswith("#"):
        return None

    if entry.startswith("export "):
        entry = entry[len("export ") :].strip()

    if "=" not in entry:
        return None

    key, raw_value = entry.split("=", 1)
    key = key.strip()
    if not key:
        return None

    value = _strip_quotes(raw_value.strip())
    return key, value


def ensure_local_env_loaded() -> None:
    global _LOADED
    if _LOADED:
        return

    backend_dir = Path(__file__).resolve().parent
    project_root = backend_dir.parent
    env_paths = [backend_dir / ".env", project_root / ".env"]

    for env_path in env_paths:
        if not env_path.exists():
            continue
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            parsed = _parse_line(raw_line)
            if not parsed:
                continue
            key, value = parsed
            os.environ.setdefault(key, value)

    _LOADED = True
