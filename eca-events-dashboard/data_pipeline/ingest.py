"""
Ingestion layer — the ONLY module that knows where raw submissions come from.

Everything downstream consumes ``get_raw_submissions()`` -> list[dict] and is
decoupled from the source.

Sources
-------
* MCP (primary, interactive): the KoBoToolbox MCP server tools are callable
  from Claude Code, not from the running Streamlit app. The intended refresh
  flow is therefore: an operator (or a scheduled Claude/agent run) calls the
  MCP ``get_submissions`` tool, paginating to pull all rows, and hands the
  payload to :func:`write_cache`. ``tools/refresh_data.py`` documents this.
* Local cache (what the app reads at runtime): ``cache/raw_submissions.json``.
* Synthetic (offline dev / CI): ``sample_data/synthetic_submissions.json``.
* httpx fallback (standalone/cron, no Claude): :func:`fetch_live_httpx` mirrors
  the MCP server's own paging logic using the KOBO_TOKEN env var. Use only when
  the MCP server is not usable, per the project brief.

The app never truncates: the cache holds the full set; a full re-fetch of ~7k
rows is cheap, so no incremental "since-ID" logic is needed yet.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

from config import CACHE_DIR, FORM_UID, RAW_CACHE_PATH, SYNTHETIC_PATH

_META_PATH = RAW_CACHE_PATH.replace(".json", ".meta.json")


# ── Cache read/write ──────────────────────────────────────────────────────────

def write_cache(submissions: list[dict], source: str = "mcp") -> dict:
    """Persist raw submissions + a refresh-metadata sidecar. Returns the meta."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(RAW_CACHE_PATH, "w", encoding="utf-8") as fh:
        json.dump(submissions, fh, ensure_ascii=False)
    meta = {
        "refreshed_at": datetime.now(timezone.utc).isoformat(),
        "count": len(submissions),
        "source": source,
        "form_uid": FORM_UID,
    }
    with open(_META_PATH, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)
    return meta


def read_refresh_meta() -> dict:
    for path in (_META_PATH,):
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as fh:
                return json.load(fh)
    return {}


def _read_json(path: str) -> list[dict]:
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    # Accept either a bare list or an MCP-style {"results": [...]} envelope.
    if isinstance(data, dict) and "results" in data:
        return data["results"]
    return data


# ── Public entry point ────────────────────────────────────────────────────────

def get_raw_submissions(source: str = "auto") -> tuple[list[dict], dict]:
    """Return (submissions, meta).

    source:
      - "auto"      : cache if present, else synthetic (good default for dev)
      - "cache"     : require the on-disk cache
      - "synthetic" : always the bundled synthetic dataset
    """
    if source == "synthetic":
        subs = _read_json(SYNTHETIC_PATH)
        return subs, {"source": "synthetic", "count": len(subs),
                      "refreshed_at": None}
    if source == "cache" or (source == "auto" and os.path.exists(RAW_CACHE_PATH)):
        subs = _read_json(RAW_CACHE_PATH)
        return subs, read_refresh_meta() or {"source": "cache", "count": len(subs)}
    # auto fallback -> synthetic
    if os.path.exists(SYNTHETIC_PATH):
        subs = _read_json(SYNTHETIC_PATH)
        return subs, {"source": "synthetic (no cache found)", "count": len(subs),
                      "refreshed_at": None}
    raise FileNotFoundError(
        "No raw cache and no synthetic dataset found. Run the synthetic "
        "generator (data_pipeline/synthetic.py) or refresh the cache "
        "(tools/refresh_data.py)."
    )


# ── httpx fallback (standalone/cron) ──────────────────────────────────────────

def fetch_live_httpx(page_size: int = 1000, save: bool = True) -> list[dict]:
    """Paginate all submissions via the KoBo API using KOBO_TOKEN.

    Documented fallback for scheduled/headless refresh when the MCP server is
    not available. Flattens fields (``/``->``__``) like MCP/kobo_mcp.py.

    Pagination uses explicit ``start``/``limit`` offsets and terminates against
    the endpoint's own ``count`` — we deliberately do NOT follow the response's
    ``next`` link, which has been observed to cycle and never yield ``null``,
    causing an unbounded fetch. We also dedup by ``_id`` and hard-cap the loop.
    """
    import httpx

    token = os.environ.get("KOBO_TOKEN", "")
    base = os.environ.get("KOBO_URL", "https://kf.kobotoolbox.org").rstrip("/")
    if not token:
        raise RuntimeError(
            "KOBO_TOKEN not set. This httpx path is the fallback for headless "
            "refresh; the primary path is the KoBoToolbox MCP server."
        )
    headers = {"Authorization": f"Token {token}", "Accept": "application/json"}

    def _flatten(sub: dict) -> dict:
        return {k if k.startswith("_") else k.replace("/", "__"): v for k, v in sub.items()}

    url = f"{base}/api/v2/assets/{FORM_UID}/data/"
    by_id: dict = {}          # dedup by _id (falls back to positional key)
    total: int | None = None
    start = 0
    page = 0
    timeout = httpx.Timeout(connect=15, read=180, write=30, pool=10)
    with httpx.Client(headers=headers, timeout=timeout) as client:
        while True:
            r = client.get(url, params={"start": start, "limit": page_size, "format": "json"})
            r.raise_for_status()
            data = r.json()
            if total is None:
                total = data.get("count")
            rows = data.get("results", [])
            if not rows:
                break
            for i, sub in enumerate(rows):
                flat = _flatten(sub)
                key = flat.get("_id", f"__pos_{start + i}")
                by_id[key] = flat
            page += 1
            start += len(rows)
            print(f"  page {page}: +{len(rows)} rows "
                  f"(unique {len(by_id):,} / {total if total is not None else '?'})",
                  flush=True)
            # Terminate: reached the reported count, or (when count is unknown) a
            # short page, or the safety backstop. NB: the endpoint caps a page at
            # 1000 rows regardless of the requested limit, so a "short page" only
            # signals the end when we have no count to page against.
            if total is not None and start >= total:
                break
            if total is None and len(rows) < page_size:
                break
            if page > 1000:  # ~1M rows — a hard backstop against runaway paging
                print("  WARNING: hit page backstop (1000); stopping.", flush=True)
                break
    results = list(by_id.values())
    if save:
        write_cache(results, source="httpx")
    return results


if __name__ == "__main__":
    import sys
    if "--live" in sys.argv:
        subs = fetch_live_httpx()
        print(f"Fetched and cached {len(subs):,} submissions via httpx.")
    else:
        subs, meta = get_raw_submissions("auto")
        print(f"Loaded {len(subs):,} submissions (source={meta.get('source')}).")
