# Phase 1 — Method & reproducibility notes

## What was run

| Step | Tool | Cost |
|---|---|---|
| Confirm live schema vs. the brief's primer | Kobo MCP `get_form_info` — **1 call** | flattened question list (names, types, labels) |
| Inspect real column naming & repeat population | Kobo MCP `get_submissions` — **1 call, limit=2** | 2 records |
| Bulk extract for profiling | `tools/fetch_kobo.py` (direct REST, paged) | 3,254 submissions + form definition → local JSON, **0 context cost** |
| Profiling | `tools/profile_json.py` | compact summaries only |

Total Kobo MCP calls: **2**. No raw dataset ever entered the conversation — every figure in the inventory came from a local script printing aggregates.

## Two dead ends worth recording

1. **`export_to_csv` is unusable for profiling this form.** The Kobo CSV export writes **question labels as column headers** (semicolon-delimited) and **drops every repeat group** — 190 parent columns only. Labels are also non-unique: six different columns are literally named `Burn (%)`. It was abandoned after one attempt.
2. **`export_to_excel` timed out** (>120 s, backgrounded). Not needed once the REST route worked.

The REST route (`/api/v2/assets/{uid}/data/`) is the correct source: real field names, repeats intact as nested arrays.

## Gotchas that will bite Phase 2

- **Key separator differs by source.** The REST API emits top-level keys as `group/field`; the Kobo MCP tool normalises the same keys to `group__field`. The sync must pick one and stick to it. `tools/profile_json.py` normalises `/` → `__` on load.
- **Pagination caps at 1,000 rows** regardless of the `limit` parameter, so page size cannot be used as the loop-termination signal — drive off the `count` field. (`fetch_kobo.py` originally exited after 1,000 rows for exactly this reason.)
- **Repeat groups vs. lookalikes.** `_geolocation` is a list of *floats* and `_attachments` a list of dicts — neither is a repeat group. Detect repeats as "list whose first element is a dict" **and** exclude `_`-prefixed keys.
- **`select_multiple` arrives space-delimited** (`energy_use_category` → `"facility_processing field"`).
- **Choice values are inconsistently coded.** Some lists store codes (`uganda`, `secondary_high_school_complete`, `IPCC_AR6`), others store full human labels (`coffee shaded`, `Climate Heroes`, `Compound NPK - 15% N / 15% K2O / 15% P2O5 (mixed-acid process)`). A decode map is only needed for the coded lists; the label-valued ones are display-ready but need typo normalisation (see the shade-tree case).
- **Form definition has `translations: [None]`** — single unnamed language, so `label` is a bare string, not an array.

## Files

```
coolfarm/
  .gitignore              # excludes data/raw (PII) and all CSVs
  docs/
    analytics-inventory.md   # the Phase 1 deliverable
    phase1-method.md         # this file
  tools/
    fetch_kobo.py            # one-shot bulk extract (form + submissions -> JSON)
    profile_json.py          # local profiler: struct|groups|cats|nums|years|residues|repeats|dq|choices
    profile_export.py        # CSV profiler — superseded, kept as the record of dead end #1
  data/raw/                  # GITIGNORED: contains farmer names, phones, GPS
```

Re-run profiling with:
```bash
cd coolfarm
KOBO_TOKEN=<token> python tools/fetch_kobo.py     # refresh extract
python tools/profile_json.py dq                   # any section name
```

## PII warning

`data/raw/` holds farmer names, phone numbers and precise GPS for 3,254 people. It is gitignored. Do not commit it, do not copy it into the Next.js app directory, and do not deploy from a directory containing it.
