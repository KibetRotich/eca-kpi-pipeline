MASP IV PMEL Platform
=====================

Solidaridad ECA — Planning, Monitoring, Evaluation and Learning system
Programme period: 2026 – 2030

This is a plain-text pointer file.

Full project documentation lives in README.md (in this same folder) and in the
docs/ folder. Open README.md in any text editor, or view it rendered on
GitHub at:

    https://github.com/solidaridad-eca/masp4-platform

Documentation index
-------------------

  README.md                          Project overview and getting started
  docs/architecture.md               System architecture and data flow
  docs/user-guide.md                 Day-to-day guide for Admin, M&E Officer, Viewer
  docs/database-schema.md            Tables, views, and relationships
  docs/deployment-and-rollback.md    How to deploy on Vercel; how to roll back
  docs/sprint-changelog.md           What shipped in each sprint

Quick facts
-----------

  Stack:         Next.js 16 + TypeScript + Supabase (Postgres) + Vercel
  Auth:          Google OAuth (Solidaridad accounts) via Supabase
  Roles:         admin, me_officer, viewer
  Data source:   KoboToolbox CSV exports
  Repository:    github.com/solidaridad-eca/masp4-platform
  Maintainer:    Geoffrey Rotich, Solidaridad ECA
