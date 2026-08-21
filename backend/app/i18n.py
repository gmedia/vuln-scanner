from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Literal

AppLocale = Literal["id", "en"]
DEFAULT_LOCALE: AppLocale = "id"
_LOCALES_DIR = Path(__file__).resolve().parent / "locales"


def normalize_lang(raw: str | None) -> AppLocale:
    if raw is None:
        return DEFAULT_LOCALE
    value = raw.strip().lower().replace("_", "-")
    if value.startswith("en"):
        return "en"
    if value.startswith("id"):
        return "id"
    return DEFAULT_LOCALE


@lru_cache(maxsize=8)
def load_catalog(locale: AppLocale, namespace: str) -> dict[str, str]:
    path = _LOCALES_DIR / locale / f"{namespace}.json"
    with path.open(encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict):
        raise ValueError(f"catalog {locale}/{namespace} must be an object")
    return {str(k): str(v) for k, v in data.items()}


def t(locale: AppLocale, namespace: str, key: str, **kwargs: object) -> str:
    catalog = load_catalog(locale, namespace)
    template = catalog.get(key, key)
    if kwargs:
        return template.format(**kwargs)
    return template
