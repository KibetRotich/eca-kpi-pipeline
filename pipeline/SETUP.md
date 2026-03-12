# Solidaridad ECA — Automated Pipeline Setup

One-time setup (~30 minutes). After this, the only manual step you ever do
is export a CSV from Salesforce and drop it in the `data/` folder.

---

## What you need

- A free GitHub account → https://github.com
- A Google account (for Google Sheets + Service Account)
- A free Google Cloud project (for the Service Account)

---

## Step 1 — Create a Google Sheet

1. Go to https://sheets.google.com and create a new blank spreadsheet.
2. Name it something like **"Solidaridad ECA KPI Data"**.
3. Copy the Sheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/  ← SHEET_ID is here →  /edit
   ```
   Example: `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms`

---

## Step 2 — Create a Google Service Account

This is a "bot" account that the pipeline uses to write to your Sheet.

1. Go to https://console.cloud.google.com
2. Create a new project (or use an existing one).
3. Enable the **Google Sheets API**:
   - Search "Google Sheets API" → Enable
4. Enable the **Google Drive API**:
   - Search "Google Drive API" → Enable
5. Create a Service Account:
   - IAM & Admin → Service Accounts → Create Service Account
   - Name: `solidaridad-etl` (anything works)
   - Click through to finish (no special roles needed)
6. Download the JSON key:
   - Click the service account → Keys tab → Add Key → JSON
   - A `.json` file downloads — keep this safe, treat it like a password
7. Share your Google Sheet with the service account:
   - Open the Sheet → Share
   - Paste the service account email (looks like `solidaridad-etl@your-project.iam.gserviceaccount.com`)
   - Give it **Editor** access

---

## Step 3 — Push this folder to GitHub

1. Create a new **private** repository on GitHub (e.g. `eca-kpi-pipeline`).
2. Push the entire `Claudeworks/` folder to it:
   ```bash
   cd "C:/Users/Geoffrey Rotich/Desktop/Claudeworks"
   git init
   git add .
   git commit -m "Initial commit — ECA KPI pipeline"
   git remote add origin https://github.com/YOUR_USERNAME/eca-kpi-pipeline.git
   git push -u origin main
   ```

---

## Step 4 — Add GitHub Secrets

GitHub Actions uses these secrets to authenticate with Google Sheets.

1. On GitHub, go to your repo → **Settings → Secrets and variables → Actions**.
2. Click **New repository secret** and add these two:

   | Secret name          | Value |
   |----------------------|-------|
   | `GOOGLE_CREDENTIALS` | The **entire contents** of the service account JSON file you downloaded |
   | `SHEET_ID`           | The Sheet ID from Step 1 |

---

## Step 5 — Wire the dashboard to your Sheet

1. Open `ECA_Dashboard.html` in a text editor.
2. Find line ~305:
   ```javascript
   const SHEET_ID = ""; // ← paste your Sheet ID here
   ```
3. Paste your Sheet ID:
   ```javascript
   const SHEET_ID = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms";
   ```
4. Make sure your Google Sheet is shared as **"Anyone with the link can view"**
   (the ETL script does this automatically, but you can also do it manually).
5. Save and commit the file.

---

## Step 6 — Test the pipeline

**Run it manually:**

On your local machine (with Python installed):
```bash
cd "C:/Users/Geoffrey Rotich/Desktop/Claudeworks"
pip install -r pipeline/requirements.txt

# Set environment variables
set GOOGLE_CREDENTIALS=C:\path\to\your-service-account.json
set SHEET_ID=your_sheet_id_here

# Run
python pipeline/etl.py
```

Or trigger it on GitHub:
- Go to your repo → **Actions** → **KPI ETL Pipeline** → **Run workflow**

---

## Day-to-Day Workflow (after setup)

```
1. Export CSV from Salesforce  (same as before — this is the only manual step)
2. Rename it or drop it in the data/ folder
3. git add data/filename.csv && git commit -m "New export" && git push
4. GitHub Actions runs automatically (takes ~2 minutes)
5. Google Sheet is updated
6. Open ECA_Dashboard.html — it fetches live data and shows the latest figures
```

The pipeline also runs automatically every night at 02:00 UTC (05:00 EAT)
in case you update the Sheet directly.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `GOOGLE_CREDENTIALS not set` | Check GitHub Secrets are named exactly as above |
| `SHEET_ID not set` | Check GitHub Secret is named `SHEET_ID` |
| `Permission denied` on Sheet | Re-share the Sheet with the service account email |
| Dashboard shows "Using embedded fallback data" | Sheet is not shared publicly — set to "Anyone with link can view" |
| No CSV found in data/ | Make sure your Salesforce export is in the `data/` folder |
| Column mismatch warning | Salesforce changed the export format — check column names match `COLUMN_MAP` in etl.py |
