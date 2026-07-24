# Architecture Overview

This document describes how the MASP IV PMEL Platform is put together — the major pieces, how they talk to each other, and where to look when something needs to change.

## 1. The 30-second picture

The platform is a Next.js web application backed by Supabase (a managed Postgres database with built-in authentication). Field data starts life in KoboToolbox, arrives as CSV uploads, is reviewed by humans, and ends up in normalized KPI tables that feed the dashboard. Hosting is on Vercel.

## 2. System diagram

```
                ┌────────────────────────────────────────────────────────────┐
                │                       USERS                                 │
                │   Admins · M&E Officers · Viewers (Solidaridad Google SSO) │
                └─────────────────────────┬──────────────────────────────────┘
                                          │ HTTPS
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      VERCEL — Next.js 16 (App Router)                       │
│                                                                             │
│   app/                                          lib/                        │
│   ├─ page.tsx          (landing)                ├─ supabase.ts              │
│   ├─ dashboard/        (KPI dashboard)          ├─ supabase-browser.ts      │
│   ├─ upload/           (CSV ingestion UI)       ├─ odk-parser.ts            │
│   ├─ submissions/      (review queue)           ├─ normalizers/             │
│   ├─ targets/          (KPI target editor)      │   ├─ farmer-profile.ts    │
│   ├─ enrollments/      (project-year setup)     │   ├─ service-provider…    │
│   ├─ instructions/     (in-app help)            │   ├─ s61.ts … s65.ts      │
│   ├─ auth/callback/    (Google OAuth handler)   │   └─ …                    │
│   └─ api/                                       ├─ role-context.tsx         │
│       ├─ import/       (CSV → odk_submissions)  └─ require-editor.ts        │
│       ├─ submissions/  (approve / reject)                                   │
│       ├─ targets/      (CRUD KPI targets)                                   │
│       ├─ enrollments/  (CRUD project enrolments)                            │
│       ├─ outputs/      (output records)                                     │
│       ├─ rec/          (REC indicator records)                              │
│       ├─ projects/     (project metadata)                                   │
│       └─ me/           (current user + role)                                │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │ supabase-js (REST + Realtime)
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SUPABASE (managed Postgres)                        │
│                                                                             │
│   Auth                       Tables (writable)              Views (read)    │
│   ├─ auth.users              ├─ user_roles                  ├─ v_s61_kpi    │
│   ├─ Google provider         ├─ odk_submissions             ├─ v_s62_kpi    │
│   └─ handle_new_user         ├─ project_kpi_targets         ├─ v_s63_kpi    │
│       trigger                ├─ project_year_enrollments    ├─ v_s64_kpi    │
│                              ├─ project_output_records      ├─ v_s65_kpi    │
│                              └─ project_rec_records         └─ v_kpi_summary│
│                                                                             │
│   RLS = Row-Level Security policies enforce role-based access at the DB.    │
└─────────────────────────────────────────────────────────────────────────────┘
                                  ▲
                                  │ CSV uploads (manual, via /upload)
                                  │
                          ┌───────┴────────┐
                          │ KOBOTOOLBOX    │
                          │ field forms    │
                          │ (mobile)       │
                          └────────────────┘
```

## 3. Component responsibilities

### 3.1 The Next.js app (`/app`)
- **Routing:** App Router — each folder under `app/` is a URL.
- **Server components by default**, client components are explicitly marked.
- **Page-level role gating** via `useRole()` (`lib/role-context.tsx`) on the client and `requireEditor()` (`lib/require-editor.ts`) on the server.

### 3.2 API routes (`/app/api`)
Thin REST handlers that:
1. Authenticate the request (Supabase cookie).
2. Check role permissions where needed.
3. Read/write Supabase using either the anon key (user-scoped) or the service-role key (server-only, privileged).
4. Return JSON.

### 3.3 Normalizers (`/lib/normalizers`)
Each form type has a dedicated normalizer (`farmer-profile.ts`, `s61.ts`, etc.) that maps the raw Kobo column names to the platform's canonical column names. This is where 95% of the "messy field reality vs clean dashboard" work happens.

### 3.4 Supabase
- **Auth:** Google OAuth → `auth.users` row → trigger creates `user_roles` row with default `viewer`.
- **Database:** Single Postgres database holds operational tables and read-only views for the dashboard.
- **Row-Level Security:** Enforced on `user_roles` so users can only see their own role; service-role key bypasses RLS for server-side operations.

### 3.5 Vercel
- Builds and deploys on every push to `main`.
- Holds production environment variables.
- Provides preview deployments for every pull request.

## 4. Authentication flow

```
   Browser                Vercel-hosted app          Supabase                Google
     │                          │                       │                       │
     │ click "Sign in"          │                       │                       │
     ├─────────────────────────►│                       │                       │
     │                          │ redirect to OAuth     │                       │
     │                          ├──────────────────────►│                       │
     │                          │                       │ redirect to Google    │
     │                          │                       ├──────────────────────►│
     │                          │                       │                       │
     │ Google login UI          │                       │                       │
     │◄─────────────────────────┼───────────────────────┼───────────────────────┤
     │ user authenticates                                                       │
     ├─────────────────────────────────────────────────────────────────────────►│
     │                                                                          │
     │ Google → Supabase redirect with code                                     │
     │                          │                       │                       │
     │ Supabase → /auth/callback?code=…                                         │
     ├─────────────────────────►│                       │                       │
     │                          │ exchange code         │                       │
     │                          ├──────────────────────►│                       │
     │                          │ session cookie set    │                       │
     │                          │◄──────────────────────┤                       │
     │  if new user: handle_new_user trigger writes user_roles(role='viewer')   │
     │                          │                       │                       │
     │ redirect to /dashboard   │                       │                       │
     │◄─────────────────────────┤                       │                       │
```

The PKCE code-exchange race condition documented in commit `f27938d` is why `/auth/callback` is deliberately single-use and surfaces errors instead of silently retrying.

## 5. Data ingestion flow

1. **Field officer** submits Kobo form on phone → data lands in KoboToolbox cloud.
2. **M&E Officer** exports CSV from Kobo and uploads it at `/upload`.
3. **`/api/import`** parses the CSV (`lib/odk-parser.ts`), detects the form type from column headers, and inserts each row into `odk_submissions` with `status='pending'`.
4. **Review queue at `/submissions`** lists all pending rows. M&E Officer or Admin opens a row, reviews it, and clicks Approve or Reject.
5. **On approval**, `/api/submissions/[id]/approve` runs the matching normalizer (`lib/normalizers/*.ts`) which writes one or more rows into the KPI tables (`project_output_records`, `project_rec_records`, etc.) and marks the submission `status='approved'`.
6. **Dashboard** reads from the consolidated views (`v_kpi_summary`, `v_s61_kpi` through `v_s65_kpi`) — never from the raw `odk_submissions`.

## 6. Role enforcement — defence in depth

Three layers of enforcement, so a bug in one does not breach the others:

| Layer | Where | What it does |
|-------|-------|--------------|
| Client UI | `useRole()` hook | Hides admin/editor buttons for viewers. **Cosmetic only.** |
| Server route guard | `requireEditor()` | Rejects unauthorised API requests with 403. |
| Database | Supabase RLS policies | Last line of defence — even a compromised key cannot escalate. |

## 7. Where to look when…

| Problem | Look here |
|---------|-----------|
| Login is broken | `app/auth/callback/page.tsx`, Supabase Auth settings |
| Upload fails | `app/api/import/route.ts`, `lib/odk-parser.ts` |
| Wrong KPI on dashboard | `lib/normalizers/<form>.ts`, then the corresponding view |
| User cannot see a page | `user_roles` row + `useRole()` + `requireEditor()` |
| Need to add a new form type | New normalizer in `lib/normalizers/`, register in `lib/odk-parser.ts` |
| Schema change | Write a new `pipeline/masp4_migration_sprintN.sql`, run in Supabase |
