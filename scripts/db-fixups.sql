-- Idempotent pre-push schema fixups.
-- These converge a database to the constraint names drizzle-kit expects, so that
-- `drizzle-kit push` sees no destructive drift and never prompts.
-- Safe to run repeatedly and on a fresh (empty) database.

-- promo_codes.code unique constraint: legacy databases named it
-- `promo_codes_code_key`, but drizzle generates `promo_codes_code_unique` from
-- `.unique()` in shared/schema.ts. Rename in place (no data loss) when present.
DO $$
BEGIN
  IF to_regclass('public.promo_codes') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.promo_codes'::regclass
         AND conname = 'promo_codes_code_key'
     )
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.promo_codes'::regclass
         AND conname = 'promo_codes_code_unique'
     )
  THEN
    ALTER TABLE promo_codes
      RENAME CONSTRAINT promo_codes_code_key TO promo_codes_code_unique;
  END IF;
END $$;
