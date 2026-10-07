-- Supabase-managed schemas are not recreated. Add app-owned configuration only.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
INSERT INTO storage.buckets(id,name,public,file_size_limit) VALUES
('media','media',true,52428800),('avatars','avatars',true,5242880),
('commune-uploads','commune-uploads',true,52428800),('channel-media','channel-media',true,10485760),
('dm-attachments','dm-attachments',false,10485760)
ON CONFLICT(id) DO NOTHING;
CREATE POLICY "Commune upload" ON storage.objects AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((bucket_id = 'commune-uploads'::text));
CREATE POLICY "Own commune files" ON storage.objects AS PERMISSIVE FOR ALL TO "authenticated" USING (((bucket_id = 'commune-uploads'::text) AND (owner_id = (auth.uid())::text))) WITH CHECK (((bucket_id = 'commune-uploads'::text) AND (owner_id = (auth.uid())::text)));
CREATE POLICY "Public Read Access" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'media'::text));
CREATE POLICY "Manage Channel Media" ON storage.objects AS PERMISSIVE FOR UPDATE TO "authenticated" USING (bucket_id='channel-media' AND (owner_id=auth.uid()::text OR public.get_user_role(auth.uid()) IN ('admin','admin_party','yantrik')));
CREATE POLICY "Delete Channel Media" ON storage.objects AS PERMISSIVE FOR DELETE TO "authenticated" USING (bucket_id='channel-media' AND (owner_id=auth.uid()::text OR public.get_user_role(auth.uid()) IN ('admin','admin_party','yantrik')));
CREATE POLICY "Auth Users Upload" ON storage.objects AS PERMISSIVE FOR INSERT TO public WITH CHECK (((bucket_id = 'media'::text) AND (auth.role() = 'authenticated'::text)));
CREATE POLICY "Auth Users Delete" ON storage.objects AS PERMISSIVE FOR DELETE TO public USING (bucket_id='media' AND (owner_id=auth.uid()::text OR public.get_user_role(auth.uid()) IN ('admin','admin_party','yantrik')));
CREATE POLICY "Public Read Channel Media" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING (bucket_id='channel-media' AND (owner_id=auth.uid()::text OR public.get_user_role(auth.uid()) IN ('admin','admin_party','yantrik')));
CREATE POLICY "Authenticated Upload Channel Media" ON storage.objects AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((bucket_id = 'channel-media'::text));
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT INSERT ON public.discussion_message_flags TO anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated,service_role;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO anon,authenticated,service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon,authenticated,service_role;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['discussion_channels','discussion_threads','discussion_posts','direct_messages','notifications','conversations','conversation_participants'] LOOP IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',t); END IF; END LOOP; END $$;
NOTIFY pgrst, 'reload schema';
