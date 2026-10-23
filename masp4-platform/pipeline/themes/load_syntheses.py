"""Step 3 of "synthesise themes" (Sprint 49): load syntheses.json into theme_insights as DRAFTS.

syntheses.json is a list of {theme_key, evidence_rating, review_note, synthesis: ThemeSynthesis}.
Every cited source must be a PUBLISHED study, or the load stops. Each theme's existing draft is replaced;
published syntheses are untouched until a reviewer publishes the new draft on /thematic-insights.

Usage: python -I load_syntheses.py <path-to-.env.local> <syntheses.json> [--dry-run]
"""
import json, sys, urllib.request

env = dict(l.strip().split('=', 1) for l in open(sys.argv[1], encoding='utf-8') if '=' in l and not l.startswith('#'))
URL, KEY = env['NEXT_PUBLIC_SUPABASE_URL'].strip(), env['SUPABASE_SERVICE_ROLE_KEY'].strip()
HDR = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
POINT_LISTS = ('key_evidence', 'what_works', 'barriers', 'recommendations')


def req(method, path, body=None, prefer=None):
    h = dict(HDR, Prefer=prefer) if prefer else HDR
    r = urllib.request.Request(f'{URL}/rest/v1/{path}', method=method, headers=h,
                               data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(r) as resp:
        return json.loads(resp.read() or b'null')


themes = {t['key'] for t in req('GET', 'evaluation_themes?select=key')}
published = {s['id'] for s in req('GET', 'evaluation_reports?status=eq.published&select=id')}
items = json.load(open(sys.argv[2], encoding='utf-8'))

errors, rows = [], []
for it in items:
    key, syn = it['theme_key'], it['synthesis']
    if key not in themes:
        errors.append(f'{key}: unknown theme')
    if it['evidence_rating'] not in ('strong', 'moderate', 'limited'):
        errors.append(f'{key}: bad evidence_rating')
    cited = set()
    for lst in POINT_LISTS:
        for p in syn[lst]:
            if not p['sources']:
                errors.append(f'{key}.{lst}: a point has no sources')
            cited.update(p['sources'])
    for c in syn['change_over_time']:
        cited.update(p['source'] for p in c['points'])
    for sid in cited - published:
        errors.append(f'{key}: cites {sid}, which is not a published study')
    rows.append({'theme_key': key, 'status': 'draft', 'synthesis': syn, 'evidence_rating': it['evidence_rating'],
                 'source_report_ids': sorted(cited), 'review_note': it.get('review_note'),
                 'model': 'claude-opus-5-5 (Claude Code, Team plan)'})
    print(f"{key:14} {it['evidence_rating']:8} {len(cited):2} studies")

if errors:
    print('\n'.join('ERROR ' + e for e in errors))
    sys.exit(1)
if '--dry-run' in sys.argv:
    sys.exit(0)
for row in rows:
    req('DELETE', f"theme_insights?theme_key=eq.{row['theme_key']}&status=eq.draft")
    req('POST', 'theme_insights', row, prefer='return=minimal')
print(f'{len(rows)} drafts loaded')
