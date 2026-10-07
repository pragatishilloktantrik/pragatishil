-- Initial registration is a pending application, with private drafts and no AI dependency.
ALTER TABLE public.members ALTER COLUMN dob_original DROP NOT NULL;
ALTER TABLE public.members ALTER COLUMN citizenship_number DROP NOT NULL;
ALTER TABLE public.members ALTER COLUMN dob_calendar SET DEFAULT 'unknown';
ALTER TABLE public.members ALTER COLUMN confidentiality SET DEFAULT 'keep_private';
CREATE UNIQUE INDEX members_auth_user_unique ON public.members(auth_user_id);
ALTER TABLE public.profiles ALTER COLUMN is_public SET DEFAULT false;
UPDATE public.profiles SET is_public = false WHERE role = 'member';

CREATE TABLE public.membership_drafts (
    profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object' AND octet_length(data::text) <= 16000),
    updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.membership_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own registration drafts" ON public.membership_drafts TO authenticated
    USING (profile_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND NOT is_banned))
    WITH CHECK (profile_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND NOT is_banned));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.membership_drafts TO authenticated;
GRANT ALL ON public.membership_drafts TO service_role;

DROP POLICY "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Visible profiles" ON public.profiles FOR SELECT USING (
    is_public OR id = auth.uid() OR public.get_user_role(auth.uid()) IN ('admin','admin_party','yantrik','board','central_committee')
);
-- All application writes go through the validated transaction below, or an owner review.
DROP POLICY "Authenticated users can insert own member" ON public.members;
DROP POLICY "Admins can update all members" ON public.members;
CREATE POLICY "Owner reviews members" ON public.members FOR UPDATE TO authenticated
    USING (public.has_party_permission('owner')) WITH CHECK (public.has_party_permission('owner'));
REVOKE INSERT, DELETE ON public.members FROM authenticated;

CREATE FUNCTION public.save_membership_registration(p_data jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    uid uuid := auth.uid(); result_id uuid; account_email text;
    pname text; dname text; lname text; max_ward integer;
    phone_value text := p_data->>'phone'; name_value text := btrim(p_data->>'name');
BEGIN
    IF uid IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = uid AND NOT is_banned) THEN
        RAISE EXCEPTION 'Sign in with an active account';
    END IF;
    IF jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) > 16000
       OR coalesce(length(name_value),0) NOT BETWEEN 2 AND 150
       OR coalesce(phone_value,'') !~ '^\+?[0-9]{7,15}$'
       OR (p_data->>'consent') IS DISTINCT FROM 'true'
       OR coalesce(p_data->>'provinceId','') !~ '^[1-9][0-9]{0,8}$'
       OR coalesce(p_data->>'districtId','') !~ '^[1-9][0-9]{0,8}$'
       OR coalesce(p_data->>'localLevelId','') !~ '^[1-9][0-9]{0,8}$'
       OR coalesce(p_data->>'dobCalendar','unknown') NOT IN ('AD','BS','unknown')
       OR length(coalesce(p_data->>'dob','')) > 30
       OR length(coalesce(p_data->>'citizenship','')) > 100
       OR length(coalesce(p_data->>'motivation','')) > 2000
       OR length(coalesce(p_data->>'skills','')) > 1000 THEN
        RAISE EXCEPTION 'Invalid registration details';
    END IF;
    IF coalesce(p_data->>'dob','') <> '' AND coalesce(p_data->>'dobCalendar','unknown') = 'unknown' THEN
        RAISE EXCEPTION 'Select a date calendar';
    END IF;
    SELECT p.name_en, d.name_en, l.name_en, l.num_wards INTO pname,dname,lname,max_ward
    FROM geo_provinces p JOIN geo_districts d ON d.province_id = p.id
    JOIN geo_local_levels l ON l.district_id = d.id
    WHERE p.id = (p_data->>'provinceId')::integer AND d.id = (p_data->>'districtId')::integer AND l.id = (p_data->>'localLevelId')::integer;
    IF pname IS NULL THEN RAISE EXCEPTION 'Invalid location'; END IF;
    IF coalesce(p_data->>'ward','') <> '' THEN
        IF (p_data->>'ward') !~ '^[1-9][0-9]?$' THEN RAISE EXCEPTION 'Invalid ward'; END IF;
        IF (p_data->>'ward')::integer > coalesce(max_ward,0) THEN RAISE EXCEPTION 'Invalid ward'; END IF;
    END IF;
    SELECT email INTO account_email FROM auth.users WHERE id = uid;
    IF account_email IS NULL THEN RAISE EXCEPTION 'Verified email required'; END IF;
    INSERT INTO members (auth_user_id, capacity, full_name_ne, phone, email, province_en, district_en, local_level_en,
        province_ne, district_ne, local_level_ne, dob_original, dob_calendar, citizenship_number,
        motivation_text_ne, skills_text, confidentiality, status, meta)
    VALUES (uid, 'party_member', name_value, phone_value, account_email, pname,dname,lname,pname,dname,lname,
        nullif(p_data->>'dob',''), coalesce(p_data->>'dobCalendar','unknown'), nullif(p_data->>'citizenship',''),
        nullif(p_data->>'motivation',''), nullif(p_data->>'skills',''),
        CASE WHEN p_data->>'publicProfile' = 'true' THEN 'public_ok' ELSE 'keep_private' END, 'pending',
        jsonb_build_object('geoProvinceId',p_data->>'provinceId','geoDistrictId',p_data->>'districtId',
            'geoLocalLevelId',p_data->>'localLevelId','ward',p_data->>'ward','consentedAt',now()))
    ON CONFLICT (auth_user_id) DO UPDATE SET
        full_name_ne = EXCLUDED.full_name_ne, phone = EXCLUDED.phone, email = EXCLUDED.email,
        province_en = EXCLUDED.province_en, district_en = EXCLUDED.district_en, local_level_en = EXCLUDED.local_level_en,
        province_ne = EXCLUDED.province_ne, district_ne = EXCLUDED.district_ne, local_level_ne = EXCLUDED.local_level_ne,
        dob_original = EXCLUDED.dob_original, dob_calendar = EXCLUDED.dob_calendar, citizenship_number = EXCLUDED.citizenship_number,
        motivation_text_ne = EXCLUDED.motivation_text_ne, skills_text = EXCLUDED.skills_text,
        confidentiality = EXCLUDED.confidentiality, status = 'pending', meta = members.meta || EXCLUDED.meta,
        last_verified_at = NULL, updated_at = now()
    RETURNING id INTO result_id;
    -- Pending applications never publish a profile automatically, even if opted in.
    UPDATE profiles SET is_public = false, updated_at = now() WHERE id = uid;
    DELETE FROM membership_drafts WHERE profile_id = uid;
    RETURN result_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_membership_registration(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_membership_registration(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_membership_registration(p_id uuid, p_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE m public.members;
BEGIN
    IF NOT public.has_party_permission('owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
    IF p_status NOT IN ('approved','rejected') OR p_status IS NULL THEN RAISE EXCEPTION 'Invalid review status'; END IF;
    SELECT * INTO m FROM members WHERE id = p_id FOR UPDATE;
    IF m.id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
    UPDATE members SET status = p_status, last_verified_at = CASE WHEN p_status = 'approved' THEN now() ELSE NULL END, updated_at = now() WHERE id = p_id;
    UPDATE profiles SET is_public = (p_status = 'approved' AND m.confidentiality = 'public_ok'), updated_at = now() WHERE id = m.auth_user_id;
    INSERT INTO audit_logs(action_type,target_type,target_id,table_name,record_id,action,actor_id,old_data,new_data,reason)
    VALUES ('UPDATE_SETTINGS','member',p_id::text,'members',p_id,'UPDATE',auth.uid(),jsonb_build_object('status',m.status),jsonb_build_object('status',p_status),'Owner membership review');
END;
$$;
REVOKE ALL ON FUNCTION public.review_membership_registration(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_membership_registration(uuid,text) TO authenticated;
