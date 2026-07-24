# Database Schema Reference

Live source of truth: the SQL files in `pipeline/`. This document summarises the **stable, current** shape of the database — what each table is for, the key columns, and how the views roll data up to the dashboard.

## 1. Tables

### 1.1 `user_roles` — access control
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | FK to `auth.users.id`, cascade delete |
| `role` | text | `admin` \| `me_officer` \| `viewer` (default `viewer`) |
| `email` | text | Mirror of `auth.users.email` for convenience |
| `display_name` | text | From Google profile |
| `updated_at` | timestamptz | Auto-set on change |

- **RLS enabled.** Users can SELECT their own row; service role does everything.
- **Trigger `handle_new_user`** inserts a `viewer` row whenever a new user signs in.
- Introduced in Sprint 13.

### 1.2 `odk_submissions` — raw ingest queue
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | Generated per row |
| `form_type` | text | `FarmerProfile`, `S61`, … (auto-detected) |
| `status` | text | `pending` → `approved` \| `rejected` |
| `payload` | jsonb | Original Kobo row as parsed JSON |
| `imported_by` | uuid | `auth.users.id` of the uploader |
| `imported_at` | timestamptz | |
| `reviewed_by` | uuid | Set on approve/reject |
| `reviewed_at` | timestamptz | |
| `review_note` | text | Free-text reason on rejection |
| `error` | text | Parser error if any |

Every CSV row begins life here. Approval triggers normalization into the KPI tables.

### 1.3 `project_kpi_targets`
| Column | Type | Notes |
|--------|------|-------|
| `project_id` | text | FK conceptually to projects catalogue |
| `kpi_code` | text | `S61`, `S62`, …, `REC01`, … |
| `year` | int | 2026–2030 |
| `target_new` | numeric | New beneficiaries / volume |
| `target_continued` | numeric | Continued beneficiaries / volume |
| `commodity` | text | Coffee, dairy, horticulture, … |
| `updated_at` | timestamptz | |

Annual targets set by Admins. The dashboard's "% achieved" is computed against these.

### 1.4 `project_year_enrollments`
Which projects are active in which year + commodity. Required before any KPI data is accepted for that project-year combination.

### 1.5 `project_output_records`
Approved output-level KPI rows (S61–S65 and similar). One row per beneficiary or per output event, with all relevant disaggregations.

### 1.6 `project_rec_records`
Responsible Economy Criteria indicator records (REC01–REC03 and others). Separate table because the analytical shape differs from production-output KPIs.

## 2. Views

Views are **read-only** projections used exclusively by the dashboard. They never lock or block writes.

| View | What it returns |
|------|------------------|
| `v_s61_kpi` | S61 results aggregated by project · year · country · commodity · disaggregation |
| `v_s62_kpi` | Same shape for S62 |
| `v_s63_kpi` | S63 |
| `v_s64_kpi` | S64 |
| `v_s65_kpi` | S65 |
| `v_kpi_summary` | Cross-KPI rollup feeding the headline dashboard cards |

> The dashboard always reads from views, never from base tables. This keeps schema changes safe — as long as the view contract holds, the dashboard does not break.

## 3. Relationships (simplified)

```
auth.users  ──1:1──► user_roles
                     │
                     │ approver of
                     ▼
   odk_submissions ──on approve──► project_output_records
                                    project_rec_records
                                              │
                                              │ aggregated by
                                              ▼
                                       v_s61_kpi … v_s65_kpi
                                              │
                                              ▼
                                        v_kpi_summary  ──► Dashboard

project_year_enrollments  ──gates──► project_output_records
project_kpi_targets       ──compared against──► v_kpi_summary
```

## 4. Row-Level Security policies

Enabled on `user_roles`. Policies in current production:

| Policy | Effect |
|--------|--------|
| `users_read_own_role` | A user can SELECT their own role row only. |
| `service_role_all` | The service role bypasses everything (used by server APIs). |

Operational tables (`odk_submissions`, etc.) currently rely on **application-level role checks** via `requireEditor()`. If RLS is later extended to those tables, the existing API code does not need to change — RLS is additive, not breaking.

## 5. Common queries

**How many submissions are pending review right now?**
```sql
SELECT form_type, count(*) FROM odk_submissions
WHERE status = 'pending' GROUP BY form_type;
```

**Achievement vs target for a single project this year:**
```sql
SELECT kpi_code, target_new, target_continued,
       results_new, results_continued
FROM v_kpi_summary
WHERE project_id = 'KE-MASP4-001' AND year = 2026;
```

**Audit: who approved what, last 7 days:**
```sql
SELECT s.form_type, s.reviewed_at, u.email, s.status
FROM odk_submissions s
JOIN auth.users u ON u.id = s.reviewed_by
WHERE s.reviewed_at > now() - interval '7 days'
ORDER BY s.reviewed_at DESC;
```
