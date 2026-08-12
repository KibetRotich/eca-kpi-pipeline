"""Publish the seedlings dashboard payload to Supabase Storage.

The dashboard shell fetches this object at runtime, so a data refresh is just an
overwrite here — no commit, no redeploy. Run after build_dashboard.py.

Env:
  NEXT_PUBLIC_SUPABASE_URL    Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY   service-role key (write access to Storage)
  SEEDLINGS_PAYLOAD_OUT       payload path (default: seedlings_payload.json here)
  SEEDLINGS_BUCKET            bucket name (default: dashboard-data)
  SEEDLINGS_OBJECT            object path (default: seedlings/payload.json)
"""
import os
import sys
import httpx

HERE = os.path.dirname(os.path.abspath(__file__))
DDIR = os.environ.get("SEEDLINGS_DATA_DIR", HERE)

SUPABASE_URL = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
PAYLOAD = os.environ.get("SEEDLINGS_PAYLOAD_OUT",
                         os.path.join(DDIR, "seedlings_payload.json"))
BUCKET = os.environ.get("SEEDLINGS_BUCKET", "dashboard-data")
OBJECT = os.environ.get("SEEDLINGS_OBJECT", "seedlings/payload.json")

if not SUPABASE_URL or not SERVICE_KEY:
    sys.exit("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
if not os.path.exists(PAYLOAD):
    sys.exit(f"payload not found: {PAYLOAD} (run build_dashboard.py first)")

body = open(PAYLOAD, "rb").read()
size_mb = len(body) / 1e6

# x-upsert overwrites the existing object in place, so the public URL is stable
# and never needs to change. Short max-age keeps the CDN from pinning a stale
# payload for long after a refresh; the shell also fetches with no-cache.
url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{OBJECT}"
resp = httpx.post(
    url,
    content=body,
    headers={
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Cache-Control": "max-age=60",
        "x-upsert": "true",
    },
    timeout=180.0,
)
if resp.status_code >= 300:
    sys.exit(f"upload failed: HTTP {resp.status_code} {resp.text[:400]}")

public_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{OBJECT}"
print(f"  uploaded {size_mb:.2f} MB -> {public_url}")

# Read it back before declaring success: a 200 on write with an unreadable or
# truncated object would otherwise leave the dashboard broken until someone
# opened it. Cheap insurance on a once-a-night job.
check = httpx.get(public_url, timeout=180.0)
if check.status_code != 200:
    sys.exit(f"verify failed: public URL returned HTTP {check.status_code}")
if len(check.content) != len(body):
    sys.exit(f"verify failed: served {len(check.content)} bytes, uploaded {len(body)}")
print(f"  verified {len(check.content)/1e6:.2f} MB readable at the public URL")
