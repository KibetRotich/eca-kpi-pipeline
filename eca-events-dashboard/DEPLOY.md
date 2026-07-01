# Deploying to Streamlit Community Cloud + embedding in the platform

The ECA Trainings & Events dashboard is a **live Streamlit server**, so it is
hosted on **Streamlit Community Cloud** (free, GitHub-connected) and embedded as
a section on `https://ecadata.solidaridadnetwork.org/output-insights`, directly
after the Climate Heroes / REAP dashboard.

```
KoBo (live, via KOBO_TOKEN)  ──►  Streamlit Community Cloud app  ──iframe──►  /output-insights
        st.cache_data TTL keeps it fresh          ?embed=true hides Streamlit chrome
```

The deployed app pulls **live** from KoBo (`ECA_DATA_SOURCE=live`) because the
on-disk cache is gitignored (it holds PII) and there is no MCP server on the
cloud host. `st.cache_data` (TTL 1 h) means each visitor does **not** trigger a
re-fetch — the data refreshes at most once an hour per app instance.

---

## One-time setup

### 1. Streamlit Community Cloud
1. Go to <https://share.streamlit.io> and sign in with the GitHub account that
   owns **`KibetRotich/eca-kpi-pipeline`**.
2. **Create app → Deploy a public app from GitHub** and set:
   - **Repository:** `KibetRotich/eca-kpi-pipeline`
   - **Branch:** `main`
   - **Main file path:** `eca-events-dashboard/app.py`
   - (Community Cloud auto-installs `eca-events-dashboard/requirements.txt`.)
3. Open **Advanced settings → Secrets** and paste (TOML):
   ```toml
   KOBO_TOKEN     = "<the KoBo API token>"       # same token used by the seedlings Action
   KOBO_URL       = "https://kf.kobotoolbox.org"
   ECA_DATA_SOURCE = "live"
   ECA_CACHE_TTL  = "3600"                         # optional; seconds
   ```
   > The token is **never committed** — it lives only in these secrets (and in
   > the repo's GitHub Actions secrets). `_bridge_secrets_to_env()` in
   > `components/data_access.py` copies these into the environment the ingest
   > layer reads.
4. **Deploy.** First load pulls ~6,750 rows (~30–60 s), then it's cached. Note
   the app URL, e.g. `https://eca-events.streamlit.app`.

### 2. Wire it into the platform (Vercel)
Set the env var on the **masp4-platform** Vercel project:
```
NEXT_PUBLIC_EVENTS_DASHBOARD_URL = https://<your-app>.streamlit.app
```
- Vercel → Project → **Settings → Environment Variables** → add for Production
  (and Preview if wanted) → **Redeploy** (`npx vercel --prod --yes`, since
  auto-deploy on this project is unreliable).
- `app/output-insights/page.tsx` appends `?embed=true` automatically, so no need
  to include it in the env value. The section renders in an iframe right after
  Climate Heroes / REAP.

---

## Verifying
- Visit `https://ecadata.solidaridadnetwork.org/output-insights` — the
  **ECA Trainings & Events Tracker** section shows the dashboard with no
  Streamlit menu/footer (that's `?embed=true` working).
- If it shows the placeholder text instead, `NEXT_PUBLIC_EVENTS_DASHBOARD_URL`
  isn't set on the deployed platform build.
- If the iframe is blank/refused, confirm the URL loads standalone **with**
  `?embed=true` appended.

## Refreshing data
No action needed — `st.cache_data`'s TTL re-pulls from KoBo hourly. To force it,
open the app's **⋮ menu → Rerun**, or lower `ECA_CACHE_TTL`. A code push to
`main` redeploys the app automatically (Community Cloud watches the branch).

## Access / privacy
Streamlit has no built-in auth and a Community Cloud public app is reachable by
URL. Row-level PII stays gated behind the sidebar **Restricted detail** toggle
regardless. Keep the app URL unpublished; the intended entry point is the
auth-gated platform page. For hard access control, move to Cloud Run behind the
platform network instead (see README "Deployment").
