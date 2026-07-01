"""
Refresh the local submission cache from KoBoToolbox.

Primary path (recommended): from Claude Code, ask it to page through the KoBo
MCP ``get_submissions`` tool (limit 5000, incrementing ``offset`` until
``next_offset`` is null) and write the combined list with
``data_pipeline.ingest.write_cache(all_rows, source="mcp")``. A ready-made
helper for that is :func:`write_from_mcp_pages`.

Fallback path (headless/cron): this script calls the httpx paginator directly
(needs ``KOBO_TOKEN``). Use only when the MCP server isn't available, per the
project brief.

    python tools/refresh_data.py            # httpx fallback, full re-fetch
"""
from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from data_pipeline.ingest import fetch_live_httpx, write_cache  # noqa: E402


def write_from_mcp_pages(pages: list[list[dict]]) -> dict:
    """Combine the ``results`` lists returned by successive MCP get_submissions
    calls and write the cache. Returns the refresh metadata."""
    combined = [row for page in pages for row in page]
    return write_cache(combined, source="mcp")


if __name__ == "__main__":
    rows = fetch_live_httpx()
    print(f"Refreshed cache with {len(rows):,} submissions (httpx fallback).")
