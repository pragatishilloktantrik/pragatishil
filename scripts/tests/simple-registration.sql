\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('00000000-0000-4000-8000-000000000201','registration-test@example.invalid','{"full_name":"Registration fixture"}'),
 ('00000000-0000-4000-8000-000000000202','registration-outsider@example.invalid','{"full_name":"Registration outsider"}');
SELECT id AS owner_id FROM auth.users WHERE email='pragatishilloktantrik@gmail.com' \gset
SELECT jsonb_build_object('name','Registration fixture','phone','9800000000','provinceId',p.id::text,'districtId',d.id::text,'localLevelId',l.id::text,'consent',true,'publicProfile',false) AS fixture
 FROM public.geo_provinces p JOIN public.geo_districts d ON d.province_id=p.id JOIN public.geo_local_levels l ON l.district_id=d.id LIMIT 1 \gset
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000201","role":"authenticated"}',true);
INSERT INTO public.membership_drafts(profile_id,data) VALUES(auth.uid(),'{"name":"Half done"}');
SELECT public.save_membership_registration(:'fixture'::jsonb) AS registration_id \gset
SELECT public.save_membership_registration(:'fixture'::jsonb);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.members WHERE auth_user_id=auth.uid()) <> 1 THEN RAISE EXCEPTION 'Duplicate registration'; END IF;
 IF EXISTS(SELECT 1 FROM public.members WHERE auth_user_id=auth.uid() AND (status <> 'pending' OR dob_original IS NOT NULL OR citizenship_number IS NOT NULL)) THEN RAISE EXCEPTION 'Short registration failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_public) THEN RAISE EXCEPTION 'Private default failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.membership_drafts WHERE profile_id=auth.uid()) THEN RAISE EXCEPTION 'Submitted draft not cleared'; END IF;
 BEGIN
  INSERT INTO public.members(auth_user_id,capacity,full_name_ne,phone,email,dob_calendar,status) VALUES(auth.uid(),'party_member','Bad','9800000000','bad@example.invalid','unknown','approved');
  RAISE EXCEPTION 'Self-approved direct insert';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.save_membership_registration('{"name":"Bad location","phone":"9800000000","provinceId":"99999","districtId":"1","localLevelId":"1","consent":true}');
  RAISE EXCEPTION 'Invalid location accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Invalid location' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.review_membership_registration((SELECT id FROM members WHERE auth_user_id=auth.uid()),'approved');
  RAISE EXCEPTION 'Non-owner review allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Owner access required' THEN RAISE; END IF; END;
END $$;
INSERT INTO public.membership_drafts(profile_id,data) VALUES(auth.uid(),'{"name":"Private draft"}');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000202","role":"authenticated"}',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.membership_drafts) OR EXISTS(SELECT 1 FROM public.members) THEN RAISE EXCEPTION 'Outsider can read private registration'; END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id='00000000-0000-4000-8000-000000000201') THEN RAISE EXCEPTION 'Outsider can read private profile'; END IF;
END $$;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',:'owner_id','role','authenticated')::text,true);
SELECT public.review_membership_registration(:'registration_id','approved');
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id='00000000-0000-4000-8000-000000000201' AND is_public) THEN RAISE EXCEPTION 'Approval overrides privacy choice'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000201","role":"authenticated"}',true);
SELECT public.save_membership_registration(:'fixture'::jsonb || '{"publicProfile":true}');
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_public) THEN RAISE EXCEPTION 'Opt-in published before approval'; END IF;
 IF EXISTS(SELECT 1 FROM public.members WHERE auth_user_id=auth.uid() AND status <> 'pending') THEN RAISE EXCEPTION 'Edits not sent for review'; END IF;
END $$;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',:'owner_id','role','authenticated')::text,true);
SELECT public.review_membership_registration(:'registration_id','approved');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id='00000000-0000-4000-8000-000000000201' AND is_public) THEN RAISE EXCEPTION 'Approved opt-in not visible'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
\echo 'PASS: short registration, private drafts, no duplicates, pending review, owner approval and publication consent'
