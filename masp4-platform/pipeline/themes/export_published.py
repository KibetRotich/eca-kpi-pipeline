"""Step 1 of "synthesise themes" (Sprint 49): export every PUBLISHED study summary for the synthesis.

Writes published_studies.json (id, title, programme, country, period, tags, stage, summary) next to the
output path. A Claude Code session then writes one synthesis per theme (lib/themes.ts ThemeSynthesis) into
syntheses.json, citing studies by id, and load_syntheses.py loads them as drafts.

Usage: python -I export_published.py <path-to-.env.local> <out-dir>
"""
import json, os, sys, urllib.request

STAGES = ['Baseline', 'Midline', 'Endline', 'Impact evaluation', 'Thematic study']

env = dict(l.strip().split('=', 1) for l in open(sys.argv[1], encoding='utf-8') if '=' in l and not l.startswith('#'))
URL, KEY = env['NEXT_PUBLIC_SUPABASE_URL'].strip(), env['SUPABASE_SERVICE_ROLE_KEY'].strip()
HDR = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}

cols = 'id,title,programme,country,period_start,period_end,tags,summary'
r = urllib.request.Request(f'{URL}/rest/v1/evaluation_reports?status=eq.published&select={cols}&order=period_end.asc',
                           headers=HDR)
with urllib.request.urlopen(r) as resp:
    studies = json.loads(resp.read())
for s in studies:
    s['stage'] = next((t for t in STAGES if t in s['tags']), 'Study')

out = os.path.join(sys.argv[2], 'published_studies.json')
json.dump(studies, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'{len(studies)} published studies ->', out)
