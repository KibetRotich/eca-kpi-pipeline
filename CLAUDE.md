# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **data analytics dashboard project** for Solidaridad East Central Africa (ECA), tracking KPI progress across agricultural and development programs in Kenya, Uganda, Tanzania, and Ethiopia. It is not a traditional software project.

## Contents

- `ECA_PROJECTS_PROGRESS_DASHBOARD.pdf` — The main dashboard document built in Google Looker, covering projects from 2021–2026.
- `KPI_Data_Cleaned_for_Looker - KPI_Data_Cleaned_for_Looker.csv` — The underlying KPI dataset that feeds the Looker dashboard.

## Data Schema

The CSV file has these columns:
```
kpi_name, indicator_id, commodity, net_achievement, net_annual_target,
stakeholder_disaggregation, results_new, results_continued,
targets_new, targets_continued, year, project_name, country
```

## Dashboard Architecture

The Looker dashboard is organized into four landing pages:
1. **MASP III Overall Progress** — selected KPIs across all projects
2. **Commodities Dashboard** — breakdowns by commodity (coffee, dairy, gold, cotton, etc.)
3. **Individual Projects Dashboard** — per-project views
4. **MASP IV Annual Plan 2026** — forward-looking targets

Commodity clusters covered: Coffee, Food Security, Livestock/Dairy/Leather, Gold, Cotton & Textiles, and cross-cutting thematic projects (carbon, climate, resilience).
