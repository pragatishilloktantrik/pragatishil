\set ON_ERROR_STOP on
BEGIN;
GRANT USAGE ON SCHEMA auth TO anon,authenticated;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('00000000-0000-4000-8000-000000000001','recovery-test@example.invalid','{"name":"Recovery Test"}');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id='00000000-0000-4000-8000-000000000001' AND full_name='Recovery Test' AND role='member') THEN RAISE EXCEPTION 'Signup profile trigger failed'; END IF;
 IF (SELECT count(*) FROM geo_local_levels)<>753 THEN RAISE EXCEPTION 'Missing local levels';END IF;
 IF (SELECT count(*) FROM discussion_channels WHERE location_type='municipality')<>753 THEN RAISE EXCEPTION 'Missing municipality channels';END IF;
 IF (SELECT count(*) FROM discussion_channels WHERE location_type='ward')<>6743 THEN RAISE EXCEPTION 'Missing ward channels';END IF;
 IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity) THEN RAISE EXCEPTION 'Table missing RLS';END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
UPDATE profiles SET bio='User-editable field' WHERE id=auth.uid();
DO $$ BEGIN
 BEGIN
 UPDATE profiles SET role='admin' WHERE id=auth.uid();
 RAISE EXCEPTION 'Role escalation allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF EXISTS(SELECT 1 FROM discussion_channels WHERE visibility='party_only') THEN RAISE EXCEPTION 'Member can see party-only channel';END IF;
END $$;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claim.role','anon',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM members) THEN RAISE EXCEPTION 'Anonymous access to members';END IF;
 IF EXISTS(SELECT 1 FROM discussion_channels WHERE visibility<>'public') THEN RAISE EXCEPTION 'Anonymous private channel access';END IF;
 IF (SELECT count(*) FROM departments)=0 THEN RAISE EXCEPTION 'Public departments unavailable';END IF;
 IF (SELECT count(*) FROM site_settings)=0 THEN RAISE EXCEPTION 'Public settings unavailable';END IF;
END $$;
ROLLBACK;
