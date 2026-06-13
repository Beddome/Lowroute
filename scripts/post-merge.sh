#!/bin/bash
set -e

npm install

# Converge known constraint-name drift before pushing so push has no destructive
# changes to prompt about. Idempotent and safe on a fresh database.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/db-fixups.sql

# Apply schema.ts to the database non-interactively. NOTE: intentionally no
# --force. With stdin closed (post-merge), a clean diff applies silently, but any
# destructive change (drop/truncate) aborts and fails the setup loudly instead of
# silently losing data. Fix the drift (e.g. in scripts/db-fixups.sql) rather than
# forcing it through.
npx drizzle-kit push
