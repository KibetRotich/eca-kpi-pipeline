# MASP IV PMEL Platform

**Planning, Monitoring, Evaluation and Learning system for Solidaridad's MASP IV programme (2026–2030).**

This web platform is the central data backbone for MASP IV. It ingests field data from KoboToolbox, takes M&E officers through a structured review-and-approval workflow, and surfaces verified KPI results to programme leadership through a real-time dashboard.

---

## 1. What the platform does

| Capability | Plain-English description |
|------------|----------------------------|
| **Authenticated access** | Staff log in with their Solidaridad Google account. |
| **Role-based permissions** | Three tiers — Admin, M&E Officer, Viewer — each see only what they need. |
| **Project & target setup** | Admins register projects per year and set annual KPI targets. |
| **Data import from Kobo** | M&E Officers upload Kobo CSV exports; the platform auto-detects the form type. |
| **Review & approval queue** | Every submission lands in a queue where an M&E Officer or Admin approves or rejects it. |
| **Automatic normalization** | On approval, raw rows are translated into the platform's KPI tables. |
| **Live dashboard** | Country, project, and KPI roll-ups with year-over-year trends. |
| **Audit trail** | Every approval, rejection and edit is timestamped and signed by the user. |

## 2. Who uses it

- **Country teams** in Kenya, Uganda, Tanzania, Ethiopia, and the wider ECA region.
- **Regional M&E unit** for cross-country aggregation and reporting.
- **Programme leadership** for at-a-glance progress against targets.
- **Donor reporting** at the end of each reporting cycle.

## 3. Technology stack

| Layer | Tool | Why |
|-------|------|-----|
| Framework | **Next.js 16** (App Router) | Server + client rendering in one codebase. |
| Language | **TypeScript** | Type-safe code, fewer runtime surprises. |
| UI | **React 19** + Chart.js | Familiar component model + interactive charts. |
| Backend / DB | **Supabase** (Postgres + Auth + Storage) | One service for database, login, and file storage. |
| CSV parsing | **csv-parse** | Reliable Kobo export ingestion. |
| Hosting | **Vercel** | Zero-config Next.js deployment, automatic on `git push`. |

> ⚠️ **Next.js 16 note for developers:** APIs and file conventions in Next.js 16 differ from earlier versions. Consult `node_modules/next/dist/docs/` before writing route handlers or layout files.

## 4. Local installation

```bash
# 1. Clone the repository
git clone https://github.com/solidaridad-eca/masp4-platform.git
cd masp4-platform

# 2. Install dependencies
npm install

# 3. Add your environment variables (see section 5)
cp .env.local.example .env.local
# Then fill in the three Supabase keys.

# 4. Start the dev server
npm run dev
```

Open <http://localhost:3000>. Sign in with your authorised Google account.

### Other commands

```bash
npm run build      # production build
npm start          # run the production build
```

## 5. Environment variables

All variables live in `masp4-platform/.env.local` and are **never committed to git**.

| Variable | Purpose | Where to find it |
|----------|---------|------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL (safe to expose to the browser) | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public client key (safe to expose) | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** privileged key — never exposed to the browser | Supabase → Project Settings → API → Service role |

On Vercel, these are configured in **Project Settings → Environment Variables** for the Production, Preview, and Development environments.

## 6. User roles

| Role | Can do | Cannot do |
|------|--------|-----------|
| **Admin** | Everything: create projects, set targets, upload CSVs, approve/reject submissions, assign roles. | — |
| **M&E Officer** | Upload Kobo CSVs, approve/reject submissions, view all data. | Cannot change KPI targets or user roles. |
| **Viewer** | Read-only access to dashboards and approved data. | Cannot upload, approve, or change anything. |

Roles are stored in the `user_roles` table in Supabase. New Google logins are **auto-assigned `viewer`** by a database trigger. To promote a user, an Admin updates the row via SQL. See `docs/user-guide.md` for the exact procedure.

## 7. Data flow — Kobo to dashboard

```
   Field officer            Kobo Server          M&E Officer            MASP IV Platform               Dashboard
   ┌──────────┐             ┌─────────┐          ┌──────────┐           ┌──────────────────┐           ┌────────┐
   │  Phone   │  submit     │  Kobo   │  CSV     │ /upload  │  POST     │  /api/import     │  approve  │  /     │
   │  Kobo    ├────────────►│  cloud  ├─────────►│   page   ├──────────►│  → odk_submissions├─────────►│dashboard│
   │  form    │             │         │  export  │          │           │  (status=pending)│           │        │
   └──────────┘             └─────────┘          └──────────┘           └──────────────────┘           └────────┘
                                                                                  │
                                                                                  ▼
                                                                        ┌──────────────────────┐
                                                                        │ /submissions         │
                                                                        │ review queue         │
                                                                        │ → approve/reject     │
                                                                        └──────────┬───────────┘
                                                                                   ▼
                                                                        ┌──────────────────────┐
                                                                        │ lib/normalizers/*.ts │
                                                                        │ → KPI tables         │
                                                                        │ → v_kpi_summary view │
                                                                        └──────────────────────┘
```

**Form types auto-detected from CSV headers:**
FarmerProfile · ServiceProviderProfile · CSOProfile · CompanyProfile · S61 · S62 · S21Farmer · S21SP · S25 · S63 · S64 · S65

Detailed mapping logic lives in `lib/odk-parser.ts` and `lib/normalizers/`.

## 8. Sprint migration order

Database schema changes are versioned as **sprint migrations**. Run them in order in the Supabase SQL Editor.

| Sprint | File | What it does |
|--------|------|--------------|
| 5–10 | `pipeline/masp4_migration_sprint5.sql` … `sprint10.sql` *(in the workspace root `pipeline/` folder)* | Initial schema, KPI tables, views, seed projects and targets. |
| 11 | `pipeline/masp4_migration_sprint11.sql` | Output records, REC indicators, refined views. |
| 12 | `pipeline/masp4_migration_sprint12.sql` | Schema refinements and additional indicators. |
| 13 | `pipeline/masp4_migration_sprint13_roles.sql` | Role-based access (`user_roles` table, RLS policies, auto-viewer trigger). |

Full changelog: `docs/sprint-changelog.md`.

## 9. Deployment on Vercel

The platform is deployed on **Vercel** and redeploys automatically whenever a commit lands on `main`.

```
git push origin main   →   Vercel detects push   →   build + deploy   →   live in ~90 seconds
```

For environment-variable changes, rollbacks, and manual deploys see `docs/deployment-and-rollback.md`.

## 10. Where to read next

| If you want to… | Read |
|------------------|------|
| Understand the architecture | `docs/architecture.md` |
| Use the platform day-to-day | `docs/user-guide.md` |
| Query the database directly | `docs/database-schema.md` |
| Deploy or roll back | `docs/deployment-and-rollback.md` |
| See what shipped in each sprint | `docs/sprint-changelog.md` |

---

**Maintainer:** Geoffrey Rotich — Solidaridad Eastern & Central Africa Expertise Centre
**Repository:** <https://github.com/solidaridad-eca/masp4-platform>
**Programme period:** 2026 – 2030
