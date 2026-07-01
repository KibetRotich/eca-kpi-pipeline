"""
Regenerate ``choices.json`` (the authoritative code->label decode map) from the
live form definition.

Primary path (recommended): from Claude Code, call the KoBo MCP tool
``get_form_content(form_uid)`` and pass its result to
:func:`choices_from_form_content`, then write the JSON. This is how the "Option
A" refresh is intended to run.

Fallback path (headless/cron, no Claude): this script fetches the same asset
content over HTTPS using ``KOBO_TOKEN`` and writes ``choices.json`` directly.

The output shape is consumed by ``data_pipeline/decode.py``:
    { "_meta": {...}, "field_to_list": {field: list}, "lists": {list: {code: label}} }
"""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from config import CHOICES_PATH, FORM_UID  # noqa: E402


def _first_label(label, translations, translated_ok=True):
    """Choices/survey labels may be a list aligned to `translations`. Prefer an
    English translation if identifiable, else the first entry."""
    if isinstance(label, list):
        if translations:
            for i, t in enumerate(translations):
                if t and "english" in str(t).lower() and i < len(label):
                    return label[i]
        return label[0] if label else ""
    return label or ""


def choices_from_form_content(content: dict) -> dict:
    """Pure transform: get_form_content payload -> decode-map dict."""
    survey = content.get("survey", [])
    choices = content.get("choices", [])
    translations = content.get("translations", []) or []

    # field (canonical name) -> choice list name, from select_* survey rows.
    field_to_list: dict[str, str] = {}
    for row in survey:
        t = str(row.get("type", ""))
        name = row.get("name") or row.get("$autoname")
        list_name = row.get("select_from_list_name")
        if not list_name and t.startswith(("select_one", "select_multiple")):
            parts = t.split()
            if len(parts) > 1:
                list_name = parts[1]
        if name and list_name:
            field_to_list[name] = list_name

    # list name -> {code: label}
    lists: dict[str, dict[str, str]] = {}
    for ch in choices:
        list_name = ch.get("list_name")
        code = ch.get("name") or ch.get("$autovalue")
        if not list_name or code is None:
            continue
        label = _first_label(ch.get("label"), translations)
        lists.setdefault(list_name, {})[str(code)] = str(label) if label else str(code)

    return {
        "_meta": {"source": "authoritative", "form_uid": FORM_UID,
                  "translations": translations,
                  "note": "Generated from live form get_form_content."},
        "field_to_list": field_to_list,
        "lists": lists,
    }


def write_choices(data: dict, path: str = CHOICES_PATH):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    print(f"Wrote {sum(len(v) for v in data['lists'].values())} codes across "
          f"{len(data['lists'])} lists to {path}")


def _fetch_content_httpx() -> dict:
    import httpx
    token = os.environ.get("KOBO_TOKEN", "")
    base = os.environ.get("KOBO_URL", "https://kf.kobotoolbox.org").rstrip("/")
    if not token:
        raise RuntimeError("KOBO_TOKEN not set (fallback path). Preferred path: "
                           "call the MCP get_form_content tool from Claude Code.")
    r = httpx.get(f"{base}/api/v2/assets/{FORM_UID}/",
                  headers={"Authorization": f"Token {token}"}, timeout=60)
    r.raise_for_status()
    content = r.json().get("content", {})
    return {"survey": content.get("survey", []), "choices": content.get("choices", []),
            "translations": content.get("translations", [])}


if __name__ == "__main__":
    if "--from-json" in sys.argv:
        # Read a saved get_form_content payload from stdin or a file arg.
        path = sys.argv[sys.argv.index("--from-json") + 1]
        with open(path, "r", encoding="utf-8") as fh:
            content = json.load(fh)
    else:
        content = _fetch_content_httpx()
    write_choices(choices_from_form_content(content))
