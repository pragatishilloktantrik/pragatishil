-- Complete policies omitted during enum normalization.
CREATE POLICY "Departments read" ON public.departments FOR SELECT USING (true);
CREATE POLICY "Settings read" ON public.site_settings FOR SELECT USING (true);
ALTER TABLE public.discussion_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories read" ON public.discussion_categories FOR SELECT USING (true);
CREATE POLICY "Roles read own" ON public.user_roles FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY "Roles admin manage" ON public.user_roles FOR ALL TO authenticated USING (public.get_user_role(auth.uid()) IN ('admin','yantrik','admin_party')) WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','yantrik','admin_party'));
CREATE POLICY "Members read own" ON public.members FOR SELECT TO authenticated USING (auth_user_id=auth.uid());
-- A user may edit their profile, but may not grant themselves an admin role or remove a ban.
CREATE FUNCTION public.protect_profile_privileges() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF current_user IN ('anon','authenticated') AND public.get_user_role(auth.uid()) NOT IN ('admin','yantrik','admin_party','board') THEN
  IF (NEW.role,NEW.is_banned,NEW.banned_until,NEW.banned_at,NEW.banned_by,NEW.ban_reason,NEW.ban_expires_at,NEW.verified_at,NEW.verified_by) IS DISTINCT FROM (OLD.role,OLD.is_banned,OLD.banned_until,OLD.banned_at,OLD.banned_by,OLD.ban_reason,OLD.ban_expires_at,OLD.verified_at,OLD.verified_by) THEN
   RAISE EXCEPTION 'Only administrators can change account privileges' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_profile_privileges BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileges();
ALTER VIEW public.thread_overviews SET (security_invoker=true);
ALTER TABLE public.discussion_threads ADD COLUMN view_count bigint NOT NULL DEFAULT 0;
CREATE FUNCTION public.increment_thread_view(t_id uuid) RETURNS void LANGUAGE sql SET search_path=public AS $$ UPDATE public.discussion_threads SET view_count=view_count+1 WHERE id=t_id; $$;
-- Recover channels directly from lookup IDs: municipality names repeat across districts.
DELETE FROM public.discussion_channels WHERE location_type IN ('ward','municipality');
INSERT INTO public.discussion_channels(name,slug,description,visibility,access_type,location_type,location_value,can_create_subchannels,min_role_to_create_threads,parent_channel_id)
SELECT g.name_en,'local-level-'||g.id,'Local-level discussions for '||g.name_en,'party_only','role_based','municipality',lower(regexp_replace(g.name_en,'[^a-zA-Z0-9]','-','g')),true,'party_member',c.id
FROM public.geo_local_levels g JOIN public.geo_districts d ON d.id=g.district_id
JOIN public.discussion_channels c ON c.location_type='district' AND c.location_value=lower(replace(CASE d.name_en WHEN 'Parwat' THEN 'Parbat' WHEN 'Acham' THEN 'Achham' WHEN 'Ramechap' THEN 'Ramechhap' WHEN 'Pachthar' THEN 'Panchthar' ELSE d.name_en END,' ','-'));
INSERT INTO public.discussion_channels(name,slug,description,visibility,access_type,location_type,location_value,parent_channel_id,min_role_to_create_threads)
SELECT 'Ward '||w,'local-level-'||g.id||'-ward-'||w,'Ward '||w||' of '||g.name_en,'party_only','role_based','ward',w::text,c.id,'party_member'
FROM public.geo_local_levels g JOIN public.discussion_channels c ON c.slug='local-level-'||g.id CROSS JOIN LATERAL generate_series(1,g.num_wards) w;
-- Supabase supplies auth/storage schemas. Only app-owned buckets and policies are configured here.
INSERT INTO storage.buckets(id,name,public,file_size_limit) VALUES ('avatars','avatars',true,5242880),('dm-attachments','dm-attachments',false,10485760) ON CONFLICT(id) DO NOTHING;
UPDATE storage.buckets SET public=true WHERE id='commune-uploads';
CREATE POLICY "Commune upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='commune-uploads');
CREATE POLICY "Own commune files" ON storage.objects FOR ALL TO authenticated USING(bucket_id='commune-uploads' AND owner_id=auth.uid()::text) WITH CHECK(bucket_id='commune-uploads' AND owner_id=auth.uid()::text);
-- DM attachments are uploaded/read by authenticated API endpoints using service_role.
DO $$ DECLARE f record; BEGIN FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef LOOP EXECUTE format('ALTER FUNCTION %s SET search_path=public', f.signature); END LOOP; END $$;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO anon,authenticated,service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon,authenticated,service_role;
