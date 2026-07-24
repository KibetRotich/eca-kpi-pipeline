# Sprint Changelog

A chronological record of what shipped in each sprint. Schema-level changes have a corresponding SQL file in `pipeline/`.

## Sprint 5 — Foundation
**Migration:** `pipeline/masp4_migration_sprint5.sql` *(in workspace root `pipeline/`)*

- Initial Supabase schema: `odk_submissions`, base KPI tables.
- First version of the CSV import endpoint.
- Project and country catalogues seeded for MASP IV scope.

## Sprint 6 — Form coverage
**Migration:** `pipeline/masp4_migration_sprint6.sql`

- Added normalizers for FarmerProfile, ServiceProviderProfile, CSOProfile, CompanyProfile.
- Output KPI tables (S61, S62) added.

## Sprint 7 — Production indicators
**Migration:** `pipeline/masp4_migration_sprint7.sql`

- S63, S64, S65 production KPIs.
- `v_s61_kpi` … `v_s65_kpi` views.
- Dashboard KPI cards wired to the views.

## Sprint 8 — REC indicators
**Migration:** `pipeline/masp4_migration_sprint8.sql`

- `project_rec_records` table for Responsible Economy Criteria indicators.
- REC01, REC02 (Production pathway) and REC03 (Services pathway) registered.

## Sprint 9 — Enrollments and targets
**Migration:** `pipeline/masp4_migration_sprint9.sql`

- `project_year_enrollments` to scope which projects report in which year.
- `project_kpi_targets` for annual targets.
- Targets editor page (`/targets`) added.

## Sprint 10 — Aggregation
**Migration:** `pipeline/masp4_migration_sprint10.sql`

- `v_kpi_summary` consolidated view powering the dashboard cards.
- 2026 target seed (`pipeline/masp4_seed_kpi_targets_2026.sql`).
- Project seed for 2026 (`pipeline/masp4_seed_projects_2026.sql`).

## Sprint 11 — Refinements
**Migration:** `pipeline/masp4_migration_sprint11.sql`

- View definition tightening; performance fixes on dashboard queries.
- Edge-case handling in normalizers for blank-cell rows.

## Sprint 12 — Operational hardening
**Migration:** `pipeline/masp4_migration_sprint12.sql`

- Additional indicator coverage.
- Schema constraints to prevent silent bad data.

## Sprint 13 — Role-based access
**Migration:** `pipeline/masp4_migration_sprint13_roles.sql`

- `user_roles` table with three tiers: `admin`, `me_officer`, `viewer`.
- Row-Level Security on `user_roles`.
- `handle_new_user` trigger auto-assigns `viewer` to every new Google login.
- Named user assignments seeded:
  - `geoffrey.rotich@solidaridadnetwork.org` → admin
  - `austine.ochieng@solidaridadnetwork.org` → me_officer
  - `secilia.charles@solidaridadnetwork.org` → me_officer
  - `joan.chepkwemboi@solidaridadnetwork.org` → me_officer
  - `carolyne.mbithe@solidaridadnetwork.org` → me_officer
- Server-side route guard `requireEditor()`.
- Client-side `useRole()` context for UI gating.
- MASP IV branding: Solidaridad standard logo in header, programme period 2026–2030.

## Post-Sprint 13 — In-app polish and Kobo V2.0
*Tracked as ordinary commits on `main` rather than as a numbered sprint.*

- Replace SVG placeholder with Solidaridad standard logo.
- REC indicator pathway reassignment: REC01/REC02 → Production, REC03 → Services.
- Rename "Responsible Economy Indicators" → "REC Level Indicators" throughout.
- Rename "seven outcome KPIs" → "Network mandated KPIs" in `/instructions`.
- Reframe 2026 as first MASP IV year; remove all "Baseline" wording.
- Remove "Adding a New Project" section from `/instructions` (now handled in `/enrollments`).
- Add Google Sign-In button to header + dedicated `/auth/callback` page.
- Split browser Supabase client to avoid service-key crash in client components.
- **Kobo Form V2.0** added — commodity-wise deployment supported.
- `/instructions` page updated for V2.0 commodity-wise deployment.
- Auth callback hardened: surface errors instead of silent redirect.
- Eliminate PKCE double-exchange race in the auth callback (commit `f27938d`).

## Documentation pass — June 2026
*This commit.*

- Replaced Next.js boilerplate `README.md` with a proper project README.
- Added `README.txt` pointer file.
- Added `docs/` folder containing: architecture overview, user guide, database schema reference, deployment & rollback guide, and this sprint changelog.
- Tidied two GitHub branches (`main` + `master`) into a single `main`.
