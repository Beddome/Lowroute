---
name: DB schema drift & db:push automation
description: Why raw-SQL schema changes get lost, and the guardrails that keep `drizzle-kit push` safe to run unattended.
---

# Drizzle schema drift on this project

## Rule: schema changes must go through `shared/schema.ts`, never raw SQL only
**Why:** Columns added only by raw SQL (not reflected in the source-of-truth schema)
are silently lost when the dev database is reprovisioned, and never reach production.
This was the exact cause of the "vehicles not saving to garage" outage — the columns
existed in `schema.ts` but were only applied via raw SQL, so a recreated dev DB and
prod were missing them and every affected query 500'd.
**How to apply:** Add the column/table to `shared/schema.ts` first, then apply to the
dev DB via push. Any table that physically exists must be declared in `schema.ts`
(including runtime-created ones like connect-pg-simple's `session` table) — otherwise
push treats it as drift and wants to DROP it.

## Rule: unattended schema push must be fail-safe, never `--force`
**Why:** Post-merge automation runs with stdin closed. `drizzle-kit push --force`
auto-accepts destructive statements (drop/truncate), so a single bit of drift could
silently wipe data (e.g. `promo_codes`). Plain `push` with stdin closed instead aborts
on any data-loss prompt and applies only clean diffs — failing loudly is the desired
outcome, because it surfaces the drift for a human/agent to fix rather than destroying
data.
**How to apply:** Keep post-merge as plain `npx drizzle-kit push` (no `--force`).
Resolve drift by converging the DB to what drizzle expects (see next rule), not by
forcing the push through.

## Rule: converge constraint-name drift via an idempotent, code-level SQL fixup
**Why:** drizzle derives constraint names from the schema (suffix `_unique` for
`.unique()`, `_pkey` for PK). A legacy DB whose names differ (it had
`promo_codes_code_key` vs drizzle's `promo_codes_code_unique`) makes push want to
"add" a duplicate constraint and prompt to truncate. A manual one-off rename is not
reproducible across environments (fresh dev DB, prod).
**How to apply:** Put guarded, idempotent renames in `scripts/db-fixups.sql` (run by
`scripts/post-merge.sh` BEFORE push). Guard with `to_regclass(...) IS NOT NULL` so it
is a no-op on a fresh/empty DB, and rename only when the legacy name exists and the
target name does not. The same fixup must be applied to prod before/at publish so the
publish diff is a no-op for it.
