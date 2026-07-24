# Deployment and Rollback

How code reaches production, how to deploy manually if needed, and how to roll back when something goes wrong.

## 1. Production environment

- **Hosting:** Vercel
- **Branch deployed:** `main`
- **Database:** Supabase (managed Postgres, persistent — not redeployed with the app)
- **Custom domain:** configured in Vercel → Project → Domains
- **Auto-deploy:** every push to `main` triggers a build and a deploy

## 2. Normal deploy — what you do

You do nothing special. Push to `main` and Vercel handles the rest.

```bash
git checkout main
git pull
# … make changes, test locally with `npm run dev` …
git add .
git commit -m "feat: <short description>"
git push origin main
```

Within ~90 seconds the new version is live. Vercel sends a notification on success or failure.

### What Vercel does behind the scenes
1. Detects the push to `main`.
2. Spins up a build container.
3. Runs `npm install` and `npm run build`.
4. If the build succeeds, atomically swaps the new version into the production URL.
5. If the build fails, the previous version keeps serving traffic — **production is never half-deployed**.

## 3. Preview deploys (pull requests)

Open a PR against `main` and Vercel will build a **preview URL** unique to that PR. Use these for stakeholder review before merging. Preview URLs use the **Preview** environment variables in Vercel, which can point to a separate Supabase project (recommended) so testing never touches production data.

## 4. Manual / emergency deploy

If automatic deploys are disabled or you need to ship a specific commit out of order:

1. Go to Vercel → **Deployments** tab.
2. Find the commit you want to ship.
3. Click **⋯ → Promote to Production**.

OR via the CLI:

```bash
npm i -g vercel
vercel login
cd masp4-platform
vercel --prod
```

## 5. Environment variables

Configured at **Vercel → Project Settings → Environment Variables** for three scopes (Production, Preview, Development).

| Variable | Scope it must exist in |
|----------|------------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview *only* (not Development unless needed) |

**Changing an env var requires a redeploy** — Vercel does not pick up the change until the next build. Trigger one with **Redeploy** on the latest deployment.

## 6. Database migrations

Migrations are **not** run automatically by the deploy. They are run by hand in the Supabase SQL Editor, in numerical order:

```
pipeline/masp4_migration_sprint5.sql
pipeline/masp4_migration_sprint6.sql
…
pipeline/masp4_migration_sprint13_roles.sql
```

> **Always migrate the database BEFORE deploying the code that depends on the new schema.** A migrated DB with old code is safe; new code against an un-migrated DB will throw.

To preview a migration safely, run it first against the Preview Supabase project (if one is set up), then production.

## 7. Rollback procedure

If a deploy breaks production:

### 7.1 Fast rollback (Vercel UI) — preferred
1. Vercel → **Deployments**.
2. Find the last known-good deployment.
3. Click **⋯ → Promote to Production**.
4. Production is back in <30 seconds. No code change required.

### 7.2 Code-level rollback
If the broken commit is already merged to `main`:
```bash
git checkout main
git pull
git revert <bad-commit-sha>
git push origin main
```
This creates a *new* commit that undoes the bad one — preferred over `reset --hard` because history stays intact.

### 7.3 Database rollback
**There is no automatic DB rollback.** If a migration must be undone, write a counter-migration:
```
pipeline/masp4_rollback_sprintN.sql
```
Test it in Preview first, then apply in Production. **Never** edit or delete an existing sprint migration file — it stays in history as the record of what was applied.

## 8. Monitoring

- **Build/deploy notifications:** Vercel emails + Slack (if configured).
- **Runtime errors:** Vercel → **Logs** tab.
- **Database health:** Supabase → **Database** → **Health**.
- **Auth issues:** Supabase → **Authentication** → **Logs**.

## 9. Disaster recovery

| Scenario | Recovery |
|----------|----------|
| Vercel project deleted | Re-import the GitHub repo into Vercel; re-add env vars; re-deploy. |
| Supabase project corrupted | Restore from the most recent Supabase backup (Project → Database → Backups). |
| Both Vercel + Supabase lost | Code in GitHub is the source of truth — re-provision. Data loss is bounded by the last Supabase backup. |
| Repo lost | Multiple developers have local clones; push the most recent to a fresh GitHub repo. |

## 10. Pre-deploy checklist

Before pushing a significant change:

- [ ] `npm run build` passes locally with no errors.
- [ ] If there is a new migration, it has been applied to the target Supabase project.
- [ ] If there are new env vars, they have been added in Vercel for every scope.
- [ ] You have tested the affected page(s) in `npm run dev` end-to-end.
- [ ] You know which previous deployment to roll back to if needed.
