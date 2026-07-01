"""
Code -> label decoding, driven by ``choices.json``.

``choices.json`` is the pluggable decode map. It has two shapes of data:

    {
      "field_to_list": { "<canonical_field>": "<choice_list_name>", ... },
      "lists":         { "<choice_list_name>": { "<code>": "<label>", ... }, ... }
    }

The authoritative version is generated from the live form via
``tools/refresh_choices.py`` (which calls the MCP ``get_form_content`` tool and
reads the ``choices`` sheet). Until that runs, a provisional map ships in the
repo; any code missing from the map falls back to a readable humanised form of
the code itself, so the dashboard is never blocked on decoding.
"""
from __future__ import annotations

import json
import os
from functools import lru_cache
from typing import Any

from config import CHOICES_PATH


def humanize(code: Any) -> str:
    """Fallback label for a code not present in choices.json.

    ``tot_lead_farmer`` -> ``Tot Lead Farmer``; ``below_35`` -> ``Below 35``.
    """
    if code is None:
        return ""
    s = str(code).strip()
    if not s:
        return ""
    # Common acronyms we always want upper-cased for readability.
    s = s.replace("_", " ").replace("-", " ").strip()
    words = []
    ACRONYMS = {"vsla", "csa", "gap", "gaps", "sme", "gps", "id", "cso", "p4g"}
    for w in s.split():
        words.append(w.upper() if w.lower() in ACRONYMS else w.capitalize())
    return " ".join(words)


class Decoder:
    """Decodes coded field values to human-readable labels."""

    def __init__(self, choices: dict | None = None):
        choices = choices or {}
        self.field_to_list: dict[str, str] = choices.get("field_to_list", {})
        self.lists: dict[str, dict[str, str]] = choices.get("lists", {})
        self.meta: dict = choices.get("_meta", {})

    # -- construction ---------------------------------------------------------
    @classmethod
    def from_file(cls, path: str = CHOICES_PATH) -> "Decoder":
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as fh:
                return cls(json.load(fh))
        return cls({})

    @property
    def is_provisional(self) -> bool:
        return str(self.meta.get("source", "provisional")).lower() != "authoritative"

    # -- decoding -------------------------------------------------------------
    def label(self, field: str, code: Any) -> str:
        """Decode a single code for a given canonical field."""
        if code is None or (isinstance(code, float)):
            # NaN / None
            try:
                import math
                if isinstance(code, float) and math.isnan(code):
                    return ""
            except Exception:
                pass
        s = "" if code is None else str(code).strip()
        if not s:
            return ""
        list_name = self.field_to_list.get(field)
        if list_name and s in self.lists.get(list_name, {}):
            return self.lists[list_name][s]
        # Some fields share a list named after the field itself.
        if field in self.lists and s in self.lists[field]:
            return self.lists[field][s]
        return humanize(s)

    def labels(self, field: str, codes) -> list[str]:
        """Decode a list/iterable of codes."""
        if codes is None:
            return []
        return [self.label(field, c) for c in codes]


@lru_cache(maxsize=1)
def get_decoder() -> Decoder:
    """Process-wide singleton decoder loaded from choices.json."""
    return Decoder.from_file()
