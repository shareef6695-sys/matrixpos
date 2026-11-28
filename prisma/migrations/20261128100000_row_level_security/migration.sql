-- Defence in depth for self-hosted Supabase.
-- MatrixPOS only talks to the database through Prisma on the server, as the role that owns these tables.
-- Table owners bypass row level security, so switching it on changes nothing for the app. It does mean
-- that if this schema were ever exposed through Supabase's REST API (the anon / authenticated keys),
-- every table would return no rows instead of the whole database.
DO $$
DECLARE
  r record;
  sch text := current_schema();
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = sch
      AND c.relkind IN ('r', 'p')
      AND pg_get_userbyid(c.relowner) = current_user
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', sch, r.relname);
  END LOOP;

  -- Supabase's client-side roles must never read or write MatrixPOS data directly.
  -- These roles only exist on Supabase, so plain PostgreSQL (deploy/vps) skips this.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM anon', sch);
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM anon', sch);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON TABLES FROM anon', sch);
    IF sch <> 'public' THEN EXECUTE format('REVOKE USAGE ON SCHEMA %I FROM anon', sch); END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM authenticated', sch);
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM authenticated', sch);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON TABLES FROM authenticated', sch);
    IF sch <> 'public' THEN EXECUTE format('REVOKE USAGE ON SCHEMA %I FROM authenticated', sch); END IF;
  END IF;
END $$;
