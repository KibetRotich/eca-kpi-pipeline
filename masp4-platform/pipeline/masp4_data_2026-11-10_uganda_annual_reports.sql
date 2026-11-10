-- 2026-11-10 — Register the Uganda annual reports in the Annual Reports library
--
-- These files sit in Drive "ANNUAL REPORTS" → Uganda (1PqFKyOp-uO5jpeS_aObs_cxYR9xhvgSn).
-- Applied 2026-11-10: the first 8 rows were already registered (Drive/Gmail sweep 2026-11-04) and were
-- skipped; only the Harvesting Carbon (DGBP) 2024 row was new. Kept as the full Uganda reference list.
-- All are donor reports; programme is free text (project_id left null).
--
-- Safe to re-run: a file already in the table (same drive_file_id) is skipped, not duplicated.
-- Run the whole script in the Supabase SQL Editor. The final SELECT shows what is now listed for Uganda.

insert into public.annual_reports
  (title, report_type, programme, country, year, period_label, drive_file_id, source_url, file_type, added_by)
values
  ('EPE Tea & F&V Uganda – AfC (DSO) Annual Report 2017', 'donor', 'EPE Tea & F&V Uganda (AfC)', 'Uganda', 2017, null,
   '1MO58cNq9p-LsMJquiiHLlZpxvG1g1nNf1GLX3Qb4miM', 'https://docs.google.com/document/d/1MO58cNq9p-LsMJquiiHLlZpxvG1g1nNf1GLX3Qb4miM/edit', 'gdoc', 'bulk load 2026-11-10 (Claude Code)'),

  ('EPE Tea & F&V Uganda – AfC Progress Report 2018', 'donor', 'EPE Tea & F&V Uganda (AfC)', 'Uganda', 2018, null,
   '1iQtgzrReSvhIPbxH8PC_MbGjIZDdTPMusNU6HBXCZzc', 'https://docs.google.com/document/d/1iQtgzrReSvhIPbxH8PC_MbGjIZDdTPMusNU6HBXCZzc/edit', 'gdoc', 'bulk load 2026-11-10 (Claude Code)'),

  ('EPE Tea & F&V Uganda – AfC Progress Report 2019', 'donor', 'EPE Tea & F&V Uganda (AfC)', 'Uganda', 2019, null,
   '1ObtNQvnKrutS3RCbVRnpHwqTsScpNrtNjCpJnsIH_0Y', 'https://docs.google.com/document/d/1ObtNQvnKrutS3RCbVRnpHwqTsScpNrtNjCpJnsIH_0Y/edit', 'gdoc', 'bulk load 2026-11-10 (Claude Code)'),

  ('EPE Tea & F&V Uganda – AfC End Report 2016–2020', 'donor', 'EPE Tea & F&V Uganda (AfC)', 'Uganda', 2020, '2016–2020',
   '16didtqSgOzp5Bb4_xS5dxlbweHLUBGoRu0iCATh7kMg', 'https://docs.google.com/document/d/16didtqSgOzp5Bb4_xS5dxlbweHLUBGoRu0iCATh7kMg/edit', 'gdoc', 'bulk load 2026-11-10 (Claude Code)'),

  ('Great Lakes – AfC EPE Progress Report 2019', 'donor', 'Great Lakes (AfC)', 'Uganda', 2019, null,
   '1VAQ_kNOuEEcYU2XK35y3jt__ibUWULkl8ncuJPJeVg8', 'https://docs.google.com/document/d/1VAQ_kNOuEEcYU2XK35y3jt__ibUWULkl8ncuJPJeVg8/edit', 'gdoc', 'bulk load 2026-11-10 (Claude Code)'),

  ('Uganda Great Lakes – AfC End Report 2016–2020', 'donor', 'Great Lakes (AfC)', 'Uganda', 2020, '2016–2020',
   '1roQfYynLgV_fHWZjRTuRG3VXWLVlOdooQ7FZizYWdtE', 'https://docs.google.com/document/d/1roQfYynLgV_fHWZjRTuRG3VXWLVlOdooQ7FZizYWdtE/edit', 'gdoc', 'bulk load 2026-11-10 (Claude Code)'),

  ('Dairy Service Hubs (DaSH) – Annual Report Year 1 2021', 'donor', 'Dairy Service Hubs (DaSH)', 'Uganda', 2021, 'Year 1',
   '18O-NHEpMCJOqr0pCrrx325dlHQ6LC-9v', 'https://drive.google.com/file/d/18O-NHEpMCJOqr0pCrrx325dlHQ6LC-9v/view', 'docx', 'bulk load 2026-11-10 (Claude Code)'),

  ('CSV Project (aBi) – End of Project Report 2019–2021', 'donor', 'CSV Project (aBi)', 'Uganda', 2021, '2019–2021',
   '1BILswoCjT9Zqbqi5ndUupT5Myl_F0S73', 'https://drive.google.com/file/d/1BILswoCjT9Zqbqi5ndUupT5Myl_F0S73/view', 'pdf', 'bulk load 2026-11-10 (Claude Code)'),

  ('Harvesting Carbon (DGBP) – Full Project Yearly Report 2024', 'donor', 'Harvesting Carbon (DGBP)', 'Uganda', 2024, null,
   '1YqcPwZv9J5wMRAf_76LynQMLsZS2pIgG', 'https://drive.google.com/file/d/1YqcPwZv9J5wMRAf_76LynQMLsZS2pIgG/view', 'pdf', 'bulk load 2026-11-10 (Claude Code)')
on conflict (drive_file_id) do nothing;

-- Check: everything now listed for Uganda
select year, title, programme, report_type, added_by
from public.annual_reports
where country = 'Uganda'
order by year desc, title;
