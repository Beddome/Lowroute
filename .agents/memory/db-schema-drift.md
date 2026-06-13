---
name: DB schema drift & db:push automation
description: Why raw-SQL schema changes get lost, and why `npm run db:push` cannot run unattended here.
---

# Drizzle schema drift on this project

## Rule: schema changes must go through `shared/schema.ts`, never raw SQL only
**Why:** Columns added only by raw SQL (not reflected as a migration/source-of-truth)
are silently lost when the dev database is reprovisioned, and never reach production.
This is the exact cause of the "vehicles not saving to garage" outage — the
`vehicle_type` enum + `car_profiles.vehicle_type`/`nickname` columns existed in
`schema.ts` but were only applied via raw SQL, so the recreated dev DB and prod were
missing them, and every `car_profiles` SELECT/INSERT 500'd with
`column "vehicle_type" does not exist`.
**How to apply:** Add the column to `shared/schema.ts` (source of truth per
`drizzle.config.ts`), then apply to the dev DB. For prod, do NOT script a migration —
re-publish; Replit's publish flow diffs dev→prod and applies the additive change.

## Quirk: `npm run db:push` (drizzle-kit push) hangs on an interactive prompt
**Why:** There is pre-existing drift on `promo_codes` — the DB has a unique constraint
named `promo_codes_code_key` but `schema.ts` wants `promo_codes_code_unique`, so push
prompts "Do you want to truncate promo_codes table?" and blocks. With stdin closed
(post-merge automation) it would EOF/fail; unattended `--force` could truncate data.
**How to apply:** For a targeted, safe dev fix prefer direct additive DDL
(`CREATE TYPE ... ; ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`) over `db:push`.
To make `db:push`/post-merge automation reliable, first resolve the `promo_codes`
constraint-name drift (rename DB constraint to match, or align schema.ts) so push has
nothing to prompt about.
