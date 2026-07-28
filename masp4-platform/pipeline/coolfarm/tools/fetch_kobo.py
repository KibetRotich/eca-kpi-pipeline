"""Fetch the CFP form definition + all submissions from Kobo to local JSON.

Uses real field names and preserves repeat groups as nested arrays -- unlike the
CSV export, which uses question labels as headers and drops repeats entirely.

Output (gitignored, contains PII):
  data/raw/form_content.json   survey + choices + translations
  data/raw/submissions.json    all submissions, nested repeats intact

Usage: KOBO_TOKEN=... python tools/fetch_kobo.py
"""
import json
import os
import sys
import urllib.request

FORM = "a4AC6PCXs4QFs3KBym8KKS"
BASE = os.environ.get("KOBO_URL", "https://kf.kobotoolbox.org").rstrip("/")
TOKEN = os.environ.get("KOBO_TOKEN")
OUT = "data/raw"


def get(url):
    req = urllib.request.Request(url, headers={
        "Authorization": f"Token {TOKEN}",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)


def main():
    if not TOKEN:
        sys.exit("KOBO_TOKEN not set")
    os.makedirs(OUT, exist_ok=True)

    print("fetching form definition ...")
    asset = get(f"{BASE}/api/v2/assets/{FORM}/?format=json")
    content = asset.get("content", {})
    with open(f"{OUT}/form_content.json", "w", encoding="utf-8") as fh:
        json.dump(content, fh, ensure_ascii=False)
    print(f"  survey rows={len(content.get('survey', []))} "
          f"choices rows={len(content.get('choices', []))} "
          f"translations={content.get('translations')}")

    print("fetching submissions ...")
    # Kobo caps a page at 1000 rows regardless of the requested limit, so page
    # size cannot be used as the termination signal -- drive off `count`.
    rows, start, page, total = [], 0, 1000, None
    while True:
        batch = get(f"{BASE}/api/v2/assets/{FORM}/data/?format=json&start={start}&limit={page}")
        got = batch.get("results", [])
        total = batch.get("count", total)
        rows.extend(got)
        print(f"  +{len(got)} (total {len(rows)} / {total})")
        if not got or (total is not None and len(rows) >= total):
            break
        start += len(got)
    with open(f"{OUT}/submissions.json", "w", encoding="utf-8") as fh:
        json.dump(rows, fh, ensure_ascii=False)
    print(f"saved {len(rows)} submissions")


if __name__ == "__main__":
    main()
