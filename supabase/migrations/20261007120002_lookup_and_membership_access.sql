-- Restore read policies for lookup tables after legacy role normalization.
CREATE POLICY "Public geography read" ON public.geo_provinces FOR SELECT USING(true);
CREATE POLICY "Public geography read" ON public.geo_districts FOR SELECT USING(true);
CREATE POLICY "Public geography read" ON public.geo_local_levels FOR SELECT USING(true);
CREATE POLICY "Council read" ON public.admin_council_members FOR SELECT TO authenticated USING(true);
CREATE POLICY "Council admin manage" ON public.admin_council_members FOR ALL TO authenticated USING(public.get_user_role(auth.uid()) IN ('admin','admin_party','yantrik')) WITH CHECK(public.get_user_role(auth.uid()) IN ('admin','admin_party','yantrik'));
CREATE POLICY "Member departments read own or admin" ON public.member_departments FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.members m WHERE m.id=member_id AND m.auth_user_id=auth.uid()) OR public.get_user_role(auth.uid()) IN ('admin','admin_party','yantrik','board','central_committee'));
CREATE POLICY "Member documents read own or admin" ON public.member_documents FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.members m WHERE m.id=member_id AND m.auth_user_id=auth.uid()) OR public.get_user_role(auth.uid()) IN ('admin','admin_party','yantrik','board','central_committee'));
CREATE POLICY "Moderation logs admin read" ON public.moderation_logs FOR SELECT TO authenticated USING(public.get_user_role(auth.uid()) IN ('admin','admin_party','yantrik','board','central_committee'));
NOTIFY pgrst, 'reload schema';
