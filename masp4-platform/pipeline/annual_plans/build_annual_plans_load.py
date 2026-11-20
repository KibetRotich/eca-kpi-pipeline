"""
Annual Plans & Budgets — builds the reviewed bulk load for public.annual_plans (Sprint 69).

Input : an inventory CSV of the Drive folder ANNUAL PLANS (19agpMTD55dXWLT5e_2gBHqzgP9QE4vQK), one row per file:
        branch (project|regional), year (from the YEAR FOLDER), project_folder, subpath, in_drafts, title, mime_type,
        file_id, view_url, size_bytes, modified_time, created_time, note
Output: <out>_review.csv — every file with include / exclude, the reason, the derived fields and anything to check
        <out>.sql        — insert ... on conflict (drive_file_id) do nothing, for the included rows only

Rules (agreed Nov 2026):
  * plan year = the year folder, never a date in the file name
  * every year 2016–2027, project AND regional plans, budgets included (all staff see them)
  * drafts (files in a Drafts/ subfolder) only for a programme-year that has no FINAL file of that kind
    (plan side: plan / plan_budget; budget side: budget / plan_budget); superseded draft versions are dropped
  * duplicates, "Copy of …" files, Google-Doc conversions of a Word original and pointer-only docs are left out
Nothing is read from the files themselves; classification uses folder, title and file type only.

Usage: python -I build_annual_plans_load.py <inventory.csv> <out_prefix>
"""
import csv
import re
import sys
from collections import defaultdict

# ── Files handled by hand (by Drive file id) ───────────────────────────────────────────────────────────────────────
EXCLUDE = {
    # pointer-only Google Docs (link to the real plans)
    '13onym8uIYjvYIPEhKXo-YxShNWJCIvtjzG-NLFisWWk': 'pointer doc: links to AN Workplan Ethiopia/Kenya 2025 (Kenya registered from its own location below)',
    '1OOmCoJkjORcc7VyCDVVq3dG0wv-NcXgdMS61yrk7aEs': 'pointer doc: its target is the same file as "P2P Kenya 2026 workplan" in this folder',
    # exact / near duplicates
    '1t9koMbocgaw0sWJ3TNM4Tam6EMS4-S_2': 'duplicate of the CROSL Gantt chart in "CROSL Project Ethiopia" (same size and date)',
    '1MEHDkQe2Q3Yn11Ug57W4_Y23NwiKTxIQ': '"Copy of" the RS! 2023 Coffee workplan next to it (same size)',
    '1GOFldEb9CrWben8qtgu-Q3vAQsNGStC1': '"Copy of" RS! plan 2025 ECA Coffee summary',
    '1J8L06wZ0tVyrXIElm62Sz7sNzaZmllnBitalmhOXJ1Y': 'second copy of the Acting Now 2024 feedback memo',
    # Google-Doc conversions made during the Nov 2026 reorganisation; the Word original is kept
    '1l5c4zMBdiAeWhsr9j3gC9As1-6SzdCNbS1wEeHUjNsc': 'Google Doc copy of the RS! 2023 Coffee Word original',
    '17_iE-5RnQcOTNGVvGc_JWG7M9XurrZ4C0RV_iHeauC0': 'Google Doc copy of the RS! 2023 Tea Word original',
    '1kutld6P8z_hRkZ5PK2dRVgxyN1ZK3daiVFUZc92kaKk': 'Google Doc copy of the RS! 2023 Africa Foods Word original',
    '1xxYRAnKAbWJ_014fzChNNRwYRPXZPh_BfMxCFPFYeYs': 'Google Doc copy of the AN 2026 Ethiopia Word original',
    '1XWgPu8bXndnKPv-TXvMS1jirBcd-DdzmrZA3iXKIspY': 'Google Doc copy of the AN 2026 Kenya Word original',
    '1X137BPtFhSMvlMSW-G7wMcTP3zDFD-nnzd_61W86tQY': 'Google Doc copy of the SLI Kilimanjaro 2020 FINAL Word original',
    # same document in two formats — keep one
    '16ocTm89plcEwyh1WfXmarxKJDopfTKDl': 'Word version of "REC ECA_Annual Plan Template 2021_Final" — the PDF is kept',
    '1N3SC-X25AoCOSI6yzJ-alHKSt6h6dRqLbPgpKKOMRyY': 'Google Slides version of the EBoD ECSA 2022 deck — the final PDF is kept',
    # superseded draft versions
    '1Z5jO2PJ7yzz0fNVOmVZHNF7hGQQQj1Pw': 'draft V1 superseded by V2',
    '1BXQQN2jfoUV55zU2CNwf_SJWbHiOIvMr': 'Word copy of the BMI 2021 draft Google Doc',
}
# the six "Annex C – Civil Society actors 2025" spreadsheets: keep only the one at the RS! 2025 folder root
ANNEX_C_KEEP = '1CTFSCe8eIxmCXzJu1NcZjnyTk-KZ5-DK'

# A real plan that lives outside ANNUAL PLANS (target of the "AN Workplan 2025" pointer doc). Registered from there.
EXTRA = [dict(branch='project', year='2025', project_folder='Acting Now', subpath='(outside ANNUAL PLANS)',
              in_drafts='false', title='20240618 - AN Workplan Kenya 2025', mime_type='application/vnd.google-apps.document',
              file_id='1A2l71IrhVs9ZQD5AvIThiZq21Zwu0qZM374PkP8ayAs', note='')]

KIND_OVERRIDE = {
    '12nJ3NkwYkdiTgraf2yZxjBTXM2Gg2E7T': 'plan',   # Kenya Methane "KE-24-002_IP" — implementation plan (check if it holds the budget)
}

# ── Programme names (project folder → programme shown on the platform) ───────────────────────────────────────────
PROGRAMME = {
    'BIOCHAR FOR BETTER SOIL ETJIMMA PILOT PROJECT': 'Biochar for Better Soil (ETG Jimma pilot)',
    'CLIMATE HEROES ANNUAL PLAN Q1 2027': 'NPL Dreamfund (Climate Heroes)',
    'NPL-Dreamfund': 'NPL Dreamfund (Climate Heroes)',
    'P4G-Kenya': 'P4G',
    'Unidentified project': 'Unidentified',
    'CROSL Project Ethiopia': 'CROSL Project Ethiopia',
}

COUNTRY_BY_FOLDER = {
    'EPE Uganda': 'Uganda', 'PfC Gold Tanzania': 'Tanzania', 'SECAEC Uganda Tea Project': 'Uganda',
    'BMI Ethiopia (PfC)': 'Ethiopia', 'GTI Ethiopia (PfC)': 'Ethiopia', 'Bottom Up! Ethiopia (PfC)': 'Ethiopia',
    'AWS-SDC Ethiopia': 'Ethiopia', 'BIOCHAR FOR BETTER SOIL ETJIMMA PILOT PROJECT': 'Ethiopia', 'CROSL Project Ethiopia': 'Ethiopia',
    'SLI Kilimanjaro': 'Tanzania', 'Genesis Tanzania Gold': 'Tanzania', 'Golden Line Tanzania Gold': 'Tanzania',
    'IMPACT Tanzania Gold': 'Tanzania', 'Uganda Landscape & Conservation (AfC)': 'Uganda', 'CSV-Maize': 'Kenya',
    'H4G': 'Kenya', 'DINU-CHASE': 'Uganda', 'S4S Uganda (aBi)': 'Uganda', 'TRACE': 'Kenya', 'NOPP-Uganda': 'Uganda',
    'P4G': 'Kenya', 'P4G-Kenya': 'Kenya', 'Starbucks': 'Uganda', 'Bundled Services Pilot': 'Uganda',
    'Kenya Methane Project': 'Kenya', 'SAVE': 'Kenya',
}
# folders whose country is a guess — listed in the review file for checking
COUNTRY_GUESS = {
    'RVO Child Labour': 'Uganda', 'Dairy 2025': 'Kenya', 'LISEC & SDC projects': 'Ethiopia', 'Lake Victoria Gold': 'Tanzania',
}
COUNTRY_UNKNOWN = {'Horticulture Programme', 'IKEA Foundation CSA', 'EPRM II', 'PACE', 'Passport to Coffee Export',
                   'To Certification and Beyond', 'World Bank', 'ODFBP', 'Unidentified', 'Unidentified project'}

# Projects' Progress (public.projects) ids, linked only when a file clearly belongs to one project
P = {
    'ET-ANE': '4c549444-8e74-4f40-ab8b-93803fbcd6b5', 'KE-ANK': 'deefade1-2490-486d-9101-b9e0bff05b3c',
    'ET-BIO': 'a19de5fc-b9df-4c0d-9cbb-d433ef633634', 'KE-CCA': '77df7c7d-4835-4aee-9c0e-f39b8e8a2b47',
    'KE-CSV': '64fcdebe-6328-474d-8fc5-a16ece6cf227', 'ET-CSL': '8e9c7179-fac2-4e2e-a37b-a45a3fd73256',
    'UG-DFN': 'b5b68edc-7e9c-4591-b399-74c8ce7ab636', 'UG-NOP': 'a5352246-0112-4e99-9410-895e0c4f6744',
    'KE-P2P': 'a4c1634a-e6d8-4a47-9fb3-2bf90f9733ed', 'TZ-P2P': '6d35b0a9-7aa9-4ba1-9de9-14411eb48515',
    'KE-P2G': 'd4114f00-3996-45b4-ae35-392dc98df8bd', 'TZ-P2G': 'f6a366f3-973b-4858-968f-8d480f24f3a6',
    'UG-PBS': '6c5da47a-2f90-47d8-8d7d-95bffa28c995', 'UG-STB': 'cf15aa14-cb72-464b-b03e-d4257454364f',
    'KE-SYN': '0a007c46-f38c-4a62-a713-08bd5dcf9984',
}

COUNTRIES = ('Ethiopia', 'Kenya', 'Tanzania', 'Uganda')
REGIONAL = 'Regional (ECA)'


def clean_title(t):
    t = re.sub(r'\.(docx|doc|xlsx|xls|xlsm|pdf|pptx|dot)(\.(docx|xlsx))?$', '', t.strip(), flags=re.I)
    t = re.sub(r'\.docx\b', '', t, flags=re.I)                       # "Horticulture for Growth.docx Project Work Plan"
    t = re.sub(r'\s+', ' ', t).strip(' _')
    return t


def file_type(mime, title):
    m = mime.lower()
    if m == 'application/vnd.google-apps.document': return 'gdoc'
    if m == 'application/vnd.google-apps.spreadsheet': return 'gsheet'
    if m == 'application/vnd.google-apps.presentation': return 'gslides'
    if m == 'application/pdf': return 'pdf'
    if m == 'application/msword': return 'doc'
    if 'wordprocessingml' in m: return 'docx'
    if 'macroenabled' in m: return 'xlsm'
    if 'spreadsheetml' in m: return 'xlsx'
    if m == 'application/vnd.ms-excel': return 'xls'
    if 'presentationml' in m: return 'pptx'
    raise ValueError(f'unknown mime {mime} for {title}')


def source_url(ftype, fid):
    return {
        'gdoc': f'https://docs.google.com/document/d/{fid}/edit',
        'gsheet': f'https://docs.google.com/spreadsheets/d/{fid}/edit',
        'gslides': f'https://docs.google.com/presentation/d/{fid}/edit',
    }.get(ftype, f'https://drive.google.com/file/d/{fid}/view')


BUDGET_ONLY = re.compile(r'(^|[^a-z])budget(\.|_|\s|$)|budget template|revised budget|financial plan', re.I)
PLAN_AND_BUDGET = re.compile(r'work ?plans? ?(&|and|/|-)? ?budgets?|budget (&|and) (work ?plans?|plan)|workplan-budget|budget and workplans', re.I)
SUPPORTING = re.compile(r'annex b|annex c\.|annex c |civil society actors|feedback|kpi|targets \(all|summary of|activitiesconcept|project portfolio|ebod|csb|presentation|deliverables and +milestones', re.I)


def doc_kind(r, title):
    if r['file_id'] in KIND_OVERRIDE: return KIND_OVERRIDE[r['file_id']]
    t = title.lower()
    if PLAN_AND_BUDGET.search(t): return 'plan_budget'
    if BUDGET_ONLY.search(t) or t == 'budget': return 'budget'
    if SUPPORTING.search(t) and 'work plan 2021' not in t: return 'supporting'
    if r['branch'] == 'regional' and re.search(r'secaec kpis|annual plans$', t): return 'supporting'
    return 'plan'


def regional_programme(title):
    t = title.lower()
    if 'pmel' in t or 'pme-l' in t: return 'REC ECA – PMEL workplan'
    if 'gender' in t: return 'REC ECA – Gender Task Force'
    if 'cross-cutting' in t or t.startswith('cc workplan'): return 'REC ECA – Cross-cutting areas'
    return 'REC ECA Annual Plan'


def country_of(r, title, flags):
    if r['branch'] == 'regional':
        found = [c for c in COUNTRIES if c.lower() in title.lower()]
        return found[0] if len(found) == 1 else REGIONAL
    t = title.lower()
    found = [c for c in COUNTRIES if c.lower() in t]
    if re.search(r'\bug\b|ug/ke', t) and 'Uganda' not in found: found.append('Uganda')
    if 'honduras' in t or 'peru' in t: found = ['Uganda']            # Starbucks: only Uganda is ECA
    if len(found) == 1: return found[0]
    if len(found) > 1: return REGIONAL
    folder = r['project_folder']
    if folder in COUNTRY_BY_FOLDER: return COUNTRY_BY_FOLDER[folder]
    if folder in COUNTRY_GUESS:
        flags.append(f'country guessed as {COUNTRY_GUESS[folder]} — please confirm')
        return COUNTRY_GUESS[folder]
    if folder in COUNTRY_UNKNOWN:
        flags.append('country not known — set to Regional (ECA); please confirm')
    return REGIONAL


def project_id_of(r, title, country):
    f, t = r['project_folder'], title.lower()
    if f == 'Acting Now':
        return P['ET-ANE'] if country == 'Ethiopia' else P['KE-ANK'] if country == 'Kenya' else None
    if f.startswith('P2P'):
        coffee, gold = 'coffee' in t, 'gold' in t
        if coffee and gold: return None
        if country == 'Kenya': return P['KE-P2P'] if coffee else P['KE-P2G'] if gold else None
        if country == 'Tanzania': return P['TZ-P2P'] if coffee else P['TZ-P2G'] if gold else None
        return None
    return {
        'BIOCHAR FOR BETTER SOIL ETJIMMA PILOT PROJECT': P['ET-BIO'], 'Kenya Methane Project': P['KE-CCA'],
        'CSV-Maize': P['KE-CSV'], 'CROSL Project Ethiopia': P['ET-CSL'], 'NOPP-Uganda': P['UG-NOP'],
        'Bundled Services Pilot': P['UG-PBS'], 'Starbucks': P['UG-STB'], 'P4G': P['KE-SYN'], 'P4G-Kenya': P['KE-SYN'],
    }.get(f) or (P['UG-DFN'] if f == 'NPL-Dreamfund' and country == 'Uganda' else None)


def period_of(r, title):
    t = title
    if r['project_folder'] == 'CLIMATE HEROES ANNUAL PLAN Q1 2027' or re.search(r'2026 ?(&|\+) ?Q1 2027', t): return '2026 + Q1 2027'
    m = re.search(r'(jul[a-z]*)[ -–]+dec[a-z]* (20\d\d)', t, re.I)
    if m: return f'Jul–Dec {m.group(2)}'
    t = DATE_STAMP.sub(' ', t)                                    # 2020-04-10, 2026-10-19-09-27-38 are dates, not ranges
    m = re.search(r'(20\d\d) ?& ?(20\d\d) ?& ?(20\d\d)', t)
    if m: return f'{m.group(1)}–{m.group(3)}'
    m = re.search(r'(20\d\d) ?(?:-|–|&) ?(20\d\d|\d\d)\b', t)
    if m:
        a, b = m.group(1), m.group(2)
        end = int(b) if len(b) == 4 else 2000 + int(b)
        if int(a) < end <= int(a) + 6: return f'{a}–{b}'
    if 'closure activities' in t.lower(): return 'Closure activities'
    return None


DATE_STAMP = re.compile(r'20\d\d-\d\d-\d\d(?:-\d\d)*')


def year_mismatch(title, folder_year):
    """Years named in the title (ignoring date stamps like 20231012 / 2020-04-10) when none is the folder year."""
    t = DATE_STAMP.sub(' ', title)
    t = re.sub(r'\d{8,}', ' ', t)
    years = {int(y) for y in re.findall(r'(?<!\d)(20[12]\d)(?!\d)', t)}
    for a, b in re.findall(r'(?<!\d)(20[12]\d) ?[-–] ?(20[12]\d|\d\d)(?!\d)', t):
        end = int(b) if len(b) == 4 else 2000 + int(b)
        years |= set(range(int(a), end + 1)) if int(a) < end <= int(a) + 6 else set()
    fy = int(folder_year)
    return sorted(years) if years and fy not in years else None


def main(inv, out):
    rows = list(csv.DictReader(open(inv, encoding='utf-8'))) + EXTRA
    for r in rows:
        r['_flags'] = []
        r['_title'] = clean_title(r['title'])
        r['_draft'] = r['in_drafts'].lower() == 'true'
        r['_kind'] = doc_kind(r, r['_title'])
        r['_prog'] = regional_programme(r['_title']) if r['branch'] == 'regional' else PROGRAMME.get(r['project_folder'], r['project_folder'])
        r['_excl'] = EXCLUDE.get(r['file_id'])
        if not r['_excl'] and 'civil society actors' in r['title'].lower() and r['file_id'] != ANNEX_C_KEEP:
            r['_excl'] = 'one of six copies of Annex C (Civil Society actors 2025) — the copy at the RS! 2025 root is kept'
        if not r['_excl'] and r['project_folder'] == '' and r['branch'] == 'project':
            r['_excl'] = 'loose file in the year folder'

    # drafts: keep only where the programme-year has no final of that kind
    finals = defaultdict(set)   # (branch, year, programme) -> {'plan','budget'}
    for r in rows:
        if r['_excl'] or r['_draft'] or r['_kind'] == 'supporting': continue
        key = (r['branch'], r['year'], r['_prog'])
        if r['_kind'] in ('plan', 'plan_budget'): finals[key].add('plan')
        if r['_kind'] in ('budget', 'plan_budget'): finals[key].add('budget')
    for r in rows:
        if r['_excl'] or not r['_draft']: continue
        have = finals[(r['branch'], r['year'], r['_prog'])]
        sides = {'plan': {'plan'}, 'budget': {'budget'}, 'plan_budget': {'plan', 'budget'}, 'supporting': {'plan'}}[r['_kind']]
        if r['_kind'] == 'supporting':
            r['_excl'] = 'draft supporting document'
        elif sides <= have:
            r['_excl'] = 'draft — a final for this programme and year exists'
        elif r['_kind'] == 'plan_budget' and 'plan' in have:
            r['_flags'].append('draft kept for the BUDGET side only (a final plan exists)')
        if not r['_excl'] and re.search(r'template', r['_title'], re.I):
            r['_flags'].append('draft looks like a template — check it is filled in')

    review, inserts = [], []
    for r in sorted(rows, key=lambda r: (r['branch'], r['year'], r['_prog'], r['_title'])):
        ft = file_type(r['mime_type'], r['title'])
        country = country_of(r, r['_title'], r['_flags'])
        pid = None if r['branch'] == 'regional' else project_id_of(r, r['_title'], country)
        period = period_of(r, r['_title'])
        if r['project_folder'] == 'Kenya Methane Project': r['_flags'].append('"IP" file classed as a workplan — check whether it is the budget')
        if r['project_folder'] in ('SAVE', 'P4G-Kenya') and r['_kind'] == 'budget':
            r['_flags'].append('budget dated earlier than 2027 but filed under 2027 — confirm it is the current one')
        mismatch = None if r['_excl'] else year_mismatch(r['_title'], r['year'])
        if mismatch:
            r['_flags'].append(f"title names {', '.join(map(str, mismatch))} but it is filed under {r['year']} — check the year folder")
        if r['file_id'] == EXTRA[0]['file_id']:
            r['_flags'].append('lives outside ANNUAL PLANS (another shared drive) — copy it into 2025/Acting Now during the tidy-up')
        path = ('02 PROJECT ANNUAL PLANS' if r['branch'] == 'project' else '01 REGIONAL ANNUAL PLANS') + f"/{r['year']}" \
            + (f"/{r['project_folder']}" if r['project_folder'] else '') + (f"/{r['subpath'].rstrip('/')}" if r['subpath'] and not r['subpath'].startswith('(') else '')
        if r['subpath'].startswith('('): path = r['subpath']
        rec = dict(include='no' if r['_excl'] else 'yes', reason=r['_excl'] or '', scope=r['branch'], plan_year=r['year'],
                   programme=r['_prog'], doc_kind=r['_kind'], status='draft' if r['_draft'] else 'final', country=country,
                   period_label=period or '', file_type=ft, title=r['_title'], project_id=pid or '',
                   check=' | '.join(r['_flags']), drive_path=path, drive_file_id=r['file_id'],
                   source_url=source_url(ft, r['file_id']))
        review.append(rec)
        if not r['_excl']: inserts.append(rec)

    with open(f'{out}_review.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=list(review[0].keys()))
        w.writeheader(); w.writerows(review)

    def q(v): return 'null' if v in (None, '') else "'" + str(v).replace("'", "''") + "'"
    lines = [
        '-- Annual Plans & Budgets — reviewed bulk load (generated by pipeline/annual_plans/build_annual_plans_load.py).',
        '-- Run AFTER pipeline/masp4_migration_sprint69_annual_plans.sql. Safe to re-run: existing Drive files are skipped.',
        f'-- {len(inserts)} files. Review list: {out.split("/")[-1]}_review.csv',
        'insert into public.annual_plans',
        '  (title, scope, doc_kind, status, programme, project_id, country, plan_year, period_label, drive_file_id, source_url, file_type, drive_path, added_by)',
        'values',
    ]
    vals = [f"  ({q(r['title'])}, {q(r['scope'])}, {q(r['doc_kind'])}, {q(r['status'])}, {q(r['programme'])}, "
            f"{q(r['project_id'])}{'::uuid' if r['project_id'] else ''}, {q(r['country'])}, {r['plan_year']}, {q(r['period_label'])}, "
            f"{q(r['drive_file_id'])}, {q(r['source_url'])}, {q(r['file_type'])}, {q(r['drive_path'])}, 'bulk load 2026-11-20')"
            for r in inserts]
    lines.append(',\n'.join(vals))
    lines.append('on conflict (drive_file_id) do nothing;')
    open(f'{out}.sql', 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print(f'{len(review)} files reviewed, {len(inserts)} to load, {len(review) - len(inserts)} left out')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
