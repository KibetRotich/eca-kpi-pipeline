# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workspace Overview

This `Claudeworks/` directory is a multi-project workspace with three active codebases:

| Project | Path | Stack |
|---------|------|-------|
| ECA Dashboard (MASP III) | `./` (root) | Single-file HTML + Python ETL |
| MASP IV Platform | `./masp4-platform/` | Next.js 16 + Supabase + TypeScript |
| Meetz Dating App | `./Meetz/meetz/` | React Native (Expo) + Node.js |

---

## 1. ECA Dashboard (MASP III)

Single-file dashboard for the Solidaridad ECA MASP III programme (2021–2025).

### Local Development
```bash
python -m http.server 8080   # fetch() won't work over file://
```

### ETL Pipeline
```bash
GOOGLE_CREDENTIALS=path/to/service_account.json SHEET_ID=<id> python pipeline/etl.py
pip install -r pipeline/requirements.txt
```

### Data flow
```
Salesforce CSV → data/ → git push → GitHub Actions (pipeline/etl.py)
  → Google Sheets (ID: 1jKLh53hKZ_UVsqHnqiTQmQO4sq39ryrdZPlGwNTebic)
  → Netlify redeploys ECA_Dashboard.html
```

### ECA_Dashboard.html Architecture
Single file (~1.2 MB) — HTML, CSS, JS all inline.
- `const RAW = [...]` (line ~440) — dataset embedded at build time; falls back to this if `fetch(CSV_PATH)` fails
- `PILLAR_KPI_GROUPS` — maps result area keys (`gap`, `sbe`, `epe`, `mu`) to KPI name arrays; **names must match CSV exactly**
- `applyFilters()` — master render, stagger-renders 4 pillars with `setTimeout(300ms)` to avoid 50+ simultaneous canvases
- `renderPillar()` — KPI bubble row + by-year + by-country charts
- `generateInsights()` — computes overall %, trend, worst KPI/country/project; injects recommendation text
- `dc(id)` — destroys chart before redraw to prevent canvas reuse errors; insight donuts use separate `_insightCharts{}`
- Netlify Identity auth gate: active on Netlify, bypassed on `localhost`/`127.0.0.1`

**CSV schema:** `kpi_name, indicator_id, commodity, net_achievement, net_annual_target, stakeholder_disaggregation, results_new, results_continued, targets_new, targets_continued, year, project_name, country`

**Known quirk:** `# of farmers with improved yield (kg/ha))` has a double `)` — preserve this in `PILLAR_KPI_GROUPS` to match CSV lookups.

---

## 2. MASP IV Platform (`masp4-platform/`)

Full-stack data collection and review platform for MASP IV KPI monitoring.

### ⚠️ Next.js Version Warning
This uses **Next.js 16** which has breaking changes from earlier versions. Before writing any Next.js code, check `node_modules/next/dist/docs/` — APIs, file conventions, and routing may differ from training data.

### Commands
```bash
cd masp4-platform
npm run dev      # dev server
npm run build    # production build
npm start        # run production
```

### Environment (`masp4-platform/.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=    # server-side only, never exposed to client
```

### Architecture

**Auth flow:** Google OAuth via Supabase → `/auth/callback` exchanges code for session → sets `sb-access-token` cookie → redirect to `/dashboard`

**Role system** (3 tiers):
- `admin` — full access: create/edit targets, approve submissions, manage users
- `me_officer` — data officer: upload CSVs, approve/reject submissions
- `viewer` — read-only: dashboards only

Role is fetched from `user_roles` table via `/api/me` on every page load. Client access via `useRole()` hook (`lib/role-context.tsx`). Server-side API protection via `requireEditor()` (`lib/require-editor.ts`). New Google logins auto-create as `viewer` via Supabase trigger.

**Data import pipeline:**
```
CSV upload (/upload) → /api/import → odk_submissions (status=pending)
  → /submissions review queue → approve → lib/normalizers/* → KPI tables
  → odk_submissions.status=approved
```

Form type is auto-detected from CSV column headers. Supported forms: FarmerProfile, ServiceProviderProfile, CSOProfile, CompanyProfile, S61, S62, S21Farmer, S21SP, S25, S63, S64, S65.

**Key tables:** `user_roles`, `odk_submissions`, `project_kpi_targets`, `project_year_enrollments`, `project_output_records`, `project_rec_records`. KPI data lives in views: `v_s61_kpi` through `v_s65_kpi`, aggregated in `v_kpi_summary`.

**Sprint migrations:** SQL files in `masp4-platform/pipeline/` named by sprint (e.g., `masp4_migration_sprint13_roles.sql`). Run in Supabase SQL Editor. Sprint 13 = role system + RLS policies.

> ⚠️ **Sprint 14 is REQUIRED in every environment — apply it or logins break.**
> `masp4_migration_sprint14_auth_hardening.sql` hardens the `handle_new_user` trigger from Sprint 13. Without it, a **new user's first Google login returns a 500 `unexpected_failure`** from GoTrue: the unhardened trigger runs `SECURITY DEFINER` with no `SET search_path` and no exception handler, so any failure rolls back the whole `auth.users` insert. Sprint 14 adds `SET search_path = public` + `EXCEPTION WHEN OTHERS` (role bookkeeping can never block auth), backfills missing `user_roles` rows, and closes a privilege-escalation hole in the RLS policy. **If you re-run Sprint 13 or rebuild the DB, you MUST re-apply Sprint 14 after it.**

### Role Assignment (Sprint 13)
Named users get roles via `masp4-platform/pipeline/masp4_migration_sprint13_roles.sql`. Users must have logged in at least once before the script assigns their role (login creates the `auth.users` row). Current assignments:
- `geoffrey.rotich@solidaridadnetwork.org` → `admin`
- `austine.ochieng@solidaridadnetwork.org` → `me_officer`
- `secilia.charles@solidaridadnetwork.org` → `me_officer`
- `joan.chepkwemboi@solidaridadnetwork.org` → `me_officer`
- `carolyne.mbithe@solidaridadnetwork.org` → `me_officer`

To add a new user: they must log in first, then run an `INSERT ... ON CONFLICT DO UPDATE` against `user_roles`.

---

## 3. Meetz Dating App (`Meetz/meetz/`)

Map-first dating app for East Africa. Two sub-projects: `mobile/` (React Native) and `backend/` (Node.js).

### Commands
```bash
# Backend
cd Meetz/meetz/backend && npm run dev

# Mobile — dev (Expo Go)
cd Meetz/meetz/mobile && npx expo start

# Mobile — build preview APK (EAS cloud, uses monthly quota)
cd Meetz/meetz/mobile && eas build --profile preview --platform android

# Mobile — run on emulator/device (Windows-compatible, no quota)
cd Meetz/meetz/mobile && npx expo prebuild --platform android --clean && npx expo run:android
```

### Mobile Architecture (Expo SDK 54, New Architecture enabled)

**Auth:** Firebase REST API for phone OTP (not native Firebase SDK). Auth token stored in AsyncStorage.

**Dev bypass:** `EXPO_PUBLIC_DEV_BYPASS=true` (set in `eas.json` preview env + `.env`) enables OTP bypass — enter any phone number, then code `000000`. Dev UIDs start with `dev-user-*` and skip Firestore entirely (profile stored in AsyncStorage).

**Navigation flow:** `AgeGate → Auth → OTP → [PaymentWall if no subscription] → [ProfileSetup if incomplete] → MainTabs`

**Pricing plans** (`mobile/src/constants/theme.js` `PLANS`): 5 tiers — free (Mercury), weekly/Venus KES 199, monthly/Earth KES 599, mars KES 799, saturn/3-month KES 1,500. Payment via M-Pesa STK Push (Kenya) or Airtel Money.

**EAS builds:** `eas build --local` is macOS/Linux only — does not work on Windows. Use `npx expo run:android` with emulator for local Windows builds.

### Backend Architecture (Node.js + Express + Firebase Admin)

- **Auth middleware:** `verifyToken` (token-only, for registration) vs `authenticate` (token + Firestore doc, for app routes) vs `requireSubscription`
- **Dev tokens:** `dev-token-*` tokens bypass Firebase verification in both middlewares
- **Firestore:** user profiles, matches; **Realtime DB:** live location; **LiveKit:** VOIP/video calls
