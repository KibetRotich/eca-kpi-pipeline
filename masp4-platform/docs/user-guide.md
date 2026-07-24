# User Guide

A practical, role-by-role walkthrough of the MASP IV PMEL Platform.

The platform has three roles. Each section below covers what you can do, what you cannot, and the step-by-step "how do I…" for the common tasks.

---

## A. Admin

Admins have full control. Use this role sparingly — only the regional M&E lead and the system maintainer should hold it.

### A1. Logging in for the first time
1. Open the platform URL in any modern browser.
2. Click **Sign in with Google**.
3. Use your Solidaridad email account.
4. You will land on the dashboard. If you only see read-only views, your role has not been upgraded yet — see A6.

### A2. Setting up a new project for a reporting year
1. Go to **Enrollments**.
2. Click **+ Add Enrollment**.
3. Select the project, country, year, and target commodity.
4. Save. The project is now eligible to receive data for that year.

### A3. Setting KPI targets
1. Go to **Targets**.
2. Filter by project and year.
3. For each KPI, enter the annual target (new beneficiaries, continued beneficiaries, output volumes, etc.).
4. Save. Targets immediately drive the achievement % on the dashboard.

### A4. Promoting a user (e.g. M&E Officer → Admin)
The user must have logged in at least once so that the `auth.users` row exists.

In Supabase SQL Editor:
```sql
INSERT INTO user_roles (id, role, email, display_name)
SELECT id, 'admin', email, raw_user_meta_data->>'full_name'
FROM auth.users
WHERE email = 'newadmin@solidaridadnetwork.org'
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
```

Replace `'admin'` with `'me_officer'` or `'viewer'` as appropriate.

### A5. Approving submissions
Same flow as M&E Officer — see section B3.

### A6. Auditing user roles
```sql
SELECT email, role, updated_at FROM user_roles ORDER BY role, email;
```

---

## B. M&E Officer

M&E Officers are the day-to-day data custodians. They upload Kobo exports, review submissions, and approve or reject.

### B1. Logging in
Same as Admin step A1.

### B2. Uploading a Kobo CSV
1. In KoboToolbox, export the form's submissions as **CSV** (not XLSX).
2. In the platform, go to **Upload**.
3. Drag the CSV onto the dropzone, or click to browse.
4. Confirm the auto-detected form type at the top of the page. If detection is wrong, **do not proceed** — fix the CSV header row or report the issue.
5. Click **Import**.
6. You will see a count of new submissions queued for review.

### B3. Reviewing and approving submissions
1. Go to **Submissions**.
2. Filter by **Status: Pending**, and by form type or project if helpful.
3. Click a row to open the review panel.
4. Check the key fields (beneficiary name, ID, project, year, KPI values).
5. Click **Approve** to push the row into the KPI tables, or **Reject** with a short reason.
6. Approved data appears on the dashboard within a few seconds (views refresh on read).

### B4. Bulk rejecting bad data
If an entire upload was a duplicate or wrong project:
1. Filter Submissions to the offending batch.
2. Reject each in turn (no bulk-reject button by design — rejection is a deliberate act).
3. Document the reason in the rejection note so the field team can correct in Kobo.

### B5. What if a normalizer fails?
A submission can be rejected automatically if the normalizer cannot parse a required column. The Submission detail panel will show the parser error. Usual causes:
- Kobo column was renamed.
- A required cell is blank.
- The CSV is from a different form version.

Forward the error to the maintainer with the file attached.

---

## C. Viewer

Viewers are read-only consumers — country managers, programme leads, donor-relations staff.

### C1. Logging in
Same as Admin/M&E Officer. New Google logins are auto-assigned **viewer**.

### C2. Reading the dashboard
1. Go to **Dashboard** (the default landing page).
2. Filter by country, project, year, or KPI.
3. KPI cards show:
   - **Achievement** = current results.
   - **Target** = the annual target.
   - **%** = achievement ÷ target.
4. Trend charts show year-over-year progression.

### C3. What viewers cannot do
- Upload data.
- Approve or reject submissions.
- Edit targets or enrollments.
- Change any user role.

The buttons for those actions are simply hidden — and the server would reject the request anyway.

---

## D. Common to all roles

### D1. Forgot which role I have?
Open <http://your-platform-url/api/me> while logged in. The response includes your role.

### D2. I cannot see the data I expect
Check:
1. Is the project enrolled for the year you are filtering?
2. Have the submissions for that project been **approved**?
3. Is your role correct?

### D3. Logging out
Click your avatar in the header → **Sign out**. This clears the `sb-access-token` cookie.

### D4. Help inside the app
The **Instructions** page in the top navigation has step-by-step screenshots for the Kobo upload flow.
