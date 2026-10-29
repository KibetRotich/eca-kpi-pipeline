-- Sprint 52: commodities on Evaluation Insights studies, for the Country / Study type / Commodity filters.
-- Values come from lib/themes.ts COMMODITIES. An empty array means a programme-wide study (no single commodity).
-- Backfill (2026-10-29) maps each existing study by its programme; new uploads set them in the upload form.

alter table public.evaluation_reports
  add column if not exists commodities text[] not null default '{}';

alter table public.evaluation_reports drop constraint if exists evaluation_reports_commodities_check;
alter table public.evaluation_reports add constraint evaluation_reports_commodities_check check (
  commodities <@ array['Coffee','Maize','Food crops','Horticulture','Dairy','Livestock & beef','Tea','Oil palm',
                       'Beans & barley','Cotton & textiles','Leather','Gold']::text[]
);

update public.evaluation_reports r set commodities = m.c
from (values
  ('0064077e-f748-45e1-872d-36b07f0d68f4'::uuid, array['Maize','Food crops']),     -- Acting Now ECA endline
  ('fb35cdd8-632e-4f75-a72c-73a4759ad1f9', array['Food crops']),                   -- Acting Now programme evaluation
  ('333a3ed8-0807-483a-95e5-0dee8fc82205', array['Food crops']),                   -- Acting Now Kenya baseline
  ('cda659c5-65b8-48fb-9de3-4e521c2fb626', array['Food crops']),                   -- Acting Now Ethiopia baseline
  ('572d0a6a-8676-43ac-8d67-a5b2cef01e63', array['Cotton & textiles']),            -- Bottom Up
  ('ec5bfaa4-0986-46ea-993b-f47fa849bf81', array['Coffee','Tea','Horticulture']),  -- C&B endline
  ('db355696-e1cb-4779-a3dd-1b30e19eaf18', array['Coffee','Tea','Horticulture']),  -- C&B baseline
  ('35dd60e9-ed0d-472e-9453-2a451f94b9d9', array['Coffee']),                       -- CLEAR Supply Chains
  ('2242906e-c183-4047-904d-aedcb901b60b', array['Food crops']),                   -- CROSL
  ('22c8ca71-5fbf-4156-80ea-6ca39740d56d', array['Coffee']),                       -- Coffee Resilience (PfC) endline
  ('6525360a-f7dc-4128-abc5-047a58a308b2', array['Maize']),                        -- CSV-Maize endline
  ('4e6d370c-42b5-4be7-88a8-b1134ca44491', array['Maize']),                        -- CSV-Maize Year 2
  ('e770f855-3ecf-463c-826a-e94ea8a9ec8d', array['Maize']),                        -- CSV-Maize Year 1
  ('96c93337-430d-4ef4-b916-625ad0f60bcb', array['Maize']),                        -- CSV-Maize baseline
  ('92843ad6-528f-4a11-bd50-61ab9bc30dc8', array['Beans & barley']),               -- CSV Uganda beans & barley
  ('84c38705-9192-4f5b-aa66-8b4f51cec386', array['Dairy']),                        -- Dairy 2025
  ('5968442e-723c-454c-81a4-79fc8b8e92d5', array['Tea']),                          -- Uganda tea baseline
  ('224cf9d1-baff-4f8b-b02c-366066ae25e1', array['Horticulture','Dairy']),         -- F4APK end of project
  ('eec140e8-45e5-4cc6-9ebc-dd062c734dfe', array['Horticulture','Dairy']),         -- F4APK baseline
  ('283b85d5-2491-4881-9cab-13e4511625aa', array['Horticulture','Dairy']),         -- F4APK impact evaluation
  ('008d16ed-5bdc-448d-9b37-5024bf7472b7', array['Coffee','Dairy']),               -- FOSEK Kenya baseline
  ('634578f4-8080-409f-95ef-d751f1d2f62a', array['Coffee','Dairy']),               -- FOSEK MTE
  ('3d9223c8-4718-45b9-a0d0-a7d90b8d7901', array['Coffee','Dairy']),               -- FOSEK endline
  ('388c6fd0-8456-423d-a52b-51db633a234f', array['Coffee']),                       -- Climate Heroes (Dream Fund)
  ('3c9e693e-e134-4146-be1c-0664fb0b5925', array['Gold']),                         -- Going for Gold quantitative
  ('1ea92406-9139-40f2-8c28-3a23bc5a75e1', array['Gold']),                         -- Going for Gold qualitative
  ('f2bc00df-f5c1-4ae5-9373-994f05b5903d', array['Gold']),                         -- Golden Line MTR
  ('72922f31-0daf-4d83-8ae7-7e7e71c43581', array['Gold']),                         -- Golden Line endline
  ('a960271c-169a-4926-8764-7cb89e1ef006', array['Leather']),                      -- GTI
  ('75bea1c4-6c39-4b03-ad29-df9f30d74371', array['Coffee']),                       -- Harvesting Carbon CAI
  ('c699ca2d-bb0f-4b3a-97d5-2296d9018574', array['Coffee']),                       -- Harvesting Carbon GHG
  ('26842f44-5a4e-4010-b66a-ca7aaf90fe33', array['Horticulture']),                 -- H4G baseline
  ('975c5ed5-bab7-49a8-9f1b-00a1d4b71575', array['Horticulture']),                 -- H4G endline (final)
  ('b64cd357-29ad-4848-b8b8-e146b6758da3', array['Horticulture']),                 -- H4G endline (draft)
  ('3e98cca7-7cc3-4868-a0e4-0ad020312a6f', array['Leather']),                      -- LISEC MTE
  ('854052ce-626e-4de0-9ad0-a26a4296922d', array['Leather']),                      -- LISEC endline
  ('8d5b771f-365c-4f6c-ba76-82075899fc72', array['Dairy']),                        -- Methane reduction (Kenya dairy)
  ('d765273f-856f-453e-b3b0-03364887ab4c', array['Oil palm']),                     -- NOPP GHG baseline
  ('754748ef-7923-4814-b44b-2ac364949693', array['Oil palm']),                     -- NOPP Phase II baseline
  ('5d7bee45-6ef4-47c6-b786-eb2045875caa', array['Oil palm']),                     -- NOPP Phase I baseline
  ('f62d38d9-78ea-4b9e-a553-70371acd1773', array['Coffee','Dairy']),               -- OCDDP
  ('348d9b04-0892-4e3d-817a-29d00b825f3b', array['Coffee']),                       -- PACE MTE
  ('6a679afa-ca3b-4998-8da6-b1a42b59450a', array['Coffee']),                       -- PACE baseline
  ('dd3b22d9-1166-4a68-a97c-abc718260a85', array['Coffee']),                       -- P2P coffee Tanzania
  ('54e6e28f-2fd4-4732-be93-921074979489', array['Coffee']),                       -- P2P coffee Kenya
  ('1ce22b8c-da0e-4c62-b0bb-20a44e725b5a', array['Gold']),                         -- P2P gold
  ('748dae94-e76e-472e-88aa-54a0155725a5', array['Cotton & textiles']),            -- PfC Better Mill Initiative
  ('711b73b9-aec8-46c6-bc78-8df080264d82', array['Coffee']),                       -- PfC coffee impact assessment
  ('ee8f4367-d13f-4198-bf7c-6d97ab234279', array['Coffee']),                       -- PfC coffee baseline
  ('8b8befba-0681-48d2-882e-ac62fbfcb2af', array['Livestock & beef']),             -- Sustainable beef
  ('f31566e3-4778-4f96-b661-05f780e3d9f4', array['Gold']),                         -- FVO (ASGM)
  ('173b7e95-b8b6-43ad-94b2-0b19f03479bc', array['Coffee']),                       -- RS! coffee baseline
  ('d6f5c207-03a5-481d-a0f2-57b34649556c', array['Cotton & textiles']),            -- RS! cotton-textile baseline
  ('3e043caf-19b1-4375-8a28-d24f8b5e607f', array['Horticulture']),                 -- RS! food products baseline
  ('7b0cb73f-d83a-469d-92b5-64550ddbd8cb', array['Gold']),                         -- RS! gold baseline
  ('398bbd0b-0091-4eff-83b5-dc274abaf634', array['Tea']),                          -- RS! tea baseline
  ('64a4e0b6-9396-4974-8e5d-df3b7761c21a', array['Coffee','Horticulture']),        -- RS! fair value: coffee, fruit & veg
  ('3378e599-66f4-4c85-b0a8-79665228a3d8', array['Coffee']),                       -- RS! fair value: coffee
  ('4ba0ff14-5a9f-4cdf-9264-43ca82ed47ff', array['Tea']),                          -- RS! fair value: tea
  ('ffda19ba-8730-4fd3-8b62-5849bb7d9b63', array['Gold']),                         -- RS! fair value: gold
  ('e35e41b1-9fcb-447d-a53f-d2b8c9d6bd23', array['Coffee','Tea','Horticulture','Gold','Cotton & textiles']), -- RS! MTR
  ('64ec7100-ef77-4828-aae3-d6585a40061f', array['Horticulture']),                 -- SAVE
  ('d9c37220-2729-4223-b1b6-79160d5df63b', array['Horticulture']),                 -- Synnefa P4G
  ('b50bbe2a-922a-4f36-9d27-35e578887e67', array['Coffee']),                       -- TRACE baseline
  ('eba084df-3a5f-491a-b5b2-100289e9cb6b', array['Coffee'])                        -- TRACE endline
) as m(id, c)
where r.id = m.id;

-- Rejected rows, so they are consistent if ever re-published.
update public.evaluation_reports set commodities = array['Dairy'] where drive_file_id = '1N_xZwGboXEnrOeFMORnuog50Vk-B7qmj'; -- ODFB endline
-- Programme-wide studies keep '{}': MASP II impact assessment, MASP III MTR, PfC programme evaluation, Acting Now Photovoice.
