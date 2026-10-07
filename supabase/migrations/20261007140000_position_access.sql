-- Organizational appointments are independent of permanent system roles.
CREATE OR REPLACE FUNCTION public.get_user_role(uid uuid) RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE((SELECT role FROM public.profiles WHERE id=uid),'guest'::public.user_role);
$$;
DROP POLICY "Roles admin manage" ON public.user_roles;
CREATE POLICY "Owner manages legacy roles" ON public.user_roles FOR ALL TO authenticated USING(public.get_user_role(auth.uid())='admin') WITH CHECK(public.get_user_role(auth.uid())='admin');
CREATE TABLE public.party_positions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
 permissions text[] NOT NULL DEFAULT '{}' CHECK(permissions <@ ARRAY['news.publish','media.publish','chat.use']::text[]),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.party_appointments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 position_id uuid NOT NULL REFERENCES public.party_positions(id),
 profile_id uuid NOT NULL REFERENCES public.profiles(id),
 organization_level text NOT NULL CHECK(organization_level IN ('central','province','district','palika','ward','department')),
 unit_name text NOT NULL CHECK(length(trim(unit_name)) BETWEEN 1 AND 100),
 assigned_by uuid NOT NULL REFERENCES public.profiles(id),
 started_at timestamptz NOT NULL DEFAULT now(),
 ended_at timestamptz,
 ended_by uuid REFERENCES public.profiles(id)
);
CREATE UNIQUE INDEX party_appointments_current_seat ON public.party_appointments(position_id,organization_level,lower(unit_name)) WHERE ended_at IS NULL;
CREATE INDEX party_appointments_current_person ON public.party_appointments(profile_id) WHERE ended_at IS NULL;
ALTER TABLE public.party_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Position definitions readable" ON public.party_positions FOR SELECT TO authenticated USING(true);
CREATE POLICY "Owner manages positions" ON public.party_positions FOR ALL TO authenticated USING(public.get_user_role(auth.uid())='admin') WITH CHECK(public.get_user_role(auth.uid())='admin');
CREATE POLICY "Owner or appointee reads appointments" ON public.party_appointments FOR SELECT TO authenticated USING(profile_id=auth.uid() OR public.get_user_role(auth.uid())='admin');
-- Appointment writes go through the atomic audited functions below.
GRANT SELECT,INSERT,UPDATE,DELETE ON public.party_positions TO authenticated;
GRANT SELECT ON public.party_appointments TO authenticated;

CREATE FUNCTION public.has_party_permission(permission_key text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND NOT COALESCE(p.is_banned,false)) AND (
 public.get_user_role(auth.uid())='admin' OR EXISTS(
 SELECT 1 FROM public.party_appointments a JOIN public.party_positions p ON p.id=a.position_id
 WHERE a.profile_id=auth.uid() AND a.ended_at IS NULL AND permission_key=ANY(p.permissions)));
$$;
REVOKE ALL ON FUNCTION public.has_party_permission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_party_permission(text) TO authenticated;

CREATE FUNCTION public.assign_party_position(p_position_id uuid,p_profile_id uuid,p_level text,p_unit text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE new_id uuid; prior_ids jsonb;
BEGIN
 IF public.get_user_role(auth.uid())<>'admin' OR NOT public.has_party_permission('owner') THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_profile_id AND NOT COALESCE(is_banned,false)) THEN RAISE EXCEPTION 'Choose an active member'; END IF;
 PERFORM 1 FROM public.party_positions WHERE id=p_position_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Position not found'; END IF;
 SELECT jsonb_agg(id) INTO prior_ids FROM public.party_appointments WHERE position_id=p_position_id AND organization_level=p_level AND lower(unit_name)=lower(trim(p_unit)) AND ended_at IS NULL;
 UPDATE public.party_appointments SET ended_at=now(),ended_by=auth.uid() WHERE position_id=p_position_id AND organization_level=p_level AND lower(unit_name)=lower(trim(p_unit)) AND ended_at IS NULL;
 INSERT INTO public.party_appointments(position_id,profile_id,organization_level,unit_name,assigned_by) VALUES(p_position_id,p_profile_id,p_level,trim(p_unit),auth.uid()) RETURNING id INTO new_id;
 INSERT INTO public.audit_logs(actor_id,action_type,action,target_type,target_id,metadata) VALUES(auth.uid(),'UPDATE_SETTINGS','ASSIGN_PARTY_POSITION','party_appointment',new_id::text,jsonb_build_object('replaced',prior_ids,'profile_id',p_profile_id,'position_id',p_position_id,'level',p_level,'unit',trim(p_unit)));
 RETURN new_id;
END; $$;
CREATE FUNCTION public.end_party_appointment(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.get_user_role(auth.uid())<>'admin' OR NOT public.has_party_permission('owner') THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501'; END IF;
 UPDATE public.party_appointments SET ended_at=now(),ended_by=auth.uid() WHERE id=p_id AND ended_at IS NULL;
 IF FOUND THEN INSERT INTO public.audit_logs(actor_id,action_type,action,target_type,target_id) VALUES(auth.uid(),'UPDATE_SETTINGS','END_PARTY_APPOINTMENT','party_appointment',p_id::text); END IF;
END; $$;
REVOKE ALL ON FUNCTION public.assign_party_position(uuid,uuid,text,text), public.end_party_appointment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_party_position(uuid,uuid,text,text), public.end_party_appointment(uuid) TO authenticated;

INSERT INTO public.party_positions(name,permissions) VALUES
 ('Sachiv / सचिव',ARRAY['news.publish','media.publish','chat.use']),
 ('Adhyaksha / अध्यक्ष',ARRAY['news.publish','media.publish','chat.use']),
 ('Upadhyaksha / उपाध्यक्ष',ARRAY['chat.use']),
 ('Koshadhyaksha / कोषाध्यक्ष',ARRAY['chat.use']),
 ('Committee representative / समिति प्रतिनिधि',ARRAY['chat.use']);

-- Delegated publishers can manage official news and their own articles.
CREATE POLICY "Appointed official publishers" ON public.news_items FOR ALL TO authenticated USING(content_type='official' AND public.has_party_permission('news.publish')) WITH CHECK(content_type='official' AND public.has_party_permission('news.publish'));
CREATE POLICY "Appointed article publishers" ON public.news_items FOR ALL TO authenticated USING(content_type='article' AND author_id=auth.uid() AND public.has_party_permission('news.publish')) WITH CHECK(content_type='article' AND author_id=auth.uid() AND public.has_party_permission('news.publish'));
CREATE POLICY "Appointed media publishers read" ON public.media_gallery FOR SELECT TO authenticated USING(public.has_party_permission('media.publish'));
CREATE POLICY "Appointed media publishers insert" ON public.media_gallery FOR INSERT TO authenticated WITH CHECK(public.has_party_permission('media.publish'));
CREATE POLICY "Appointed media publishers update" ON public.media_gallery FOR UPDATE TO authenticated USING(public.has_party_permission('media.publish')) WITH CHECK(public.has_party_permission('media.publish'));

-- Private conversations must not be discoverable or joinable by outsiders.
CREATE FUNCTION public.is_conversation_participant(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.conversation_participants WHERE conversation_id=p_id AND user_id=auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_conversation_participant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid) TO authenticated;
DROP POLICY "ConvParticipants: Authenticated can read" ON public.conversation_participants;
DROP POLICY "ConvParticipants: Authenticated insert" ON public.conversation_participants;
DROP POLICY "Conversations: Authenticated can read" ON public.conversations;
DROP POLICY "Conversations: Authenticated insert" ON public.conversations;
CREATE POLICY "Participants read conversation membership" ON public.conversation_participants FOR SELECT TO authenticated USING(public.is_conversation_participant(conversation_id));
CREATE POLICY "Participants read conversations" ON public.conversations FOR SELECT TO authenticated USING(public.is_conversation_participant(id));

CREATE FUNCTION public.start_party_conversation(p_recipient uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND NOT COALESCE(is_banned,false)) THEN RAISE EXCEPTION 'Sign in with an active account' USING ERRCODE='42501'; END IF;
 IF public.get_user_role(auth.uid()) NOT IN ('party_member','team_member','central_committee','board','admin_party','yantrik','admin') AND NOT public.has_party_permission('chat.use') THEN RAISE EXCEPTION 'Chat access required' USING ERRCODE='42501'; END IF;
 IF p_recipient=auth.uid() OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_recipient AND NOT COALESCE(is_banned,false)) THEN RAISE EXCEPTION 'Choose an active recipient'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(least(auth.uid()::text,p_recipient::text)||greatest(auth.uid()::text,p_recipient::text),0));
 SELECT a.conversation_id INTO result_id FROM public.conversation_participants a JOIN public.conversation_participants b USING(conversation_id) WHERE a.user_id=auth.uid() AND b.user_id=p_recipient AND (SELECT count(*) FROM public.conversation_participants c WHERE c.conversation_id=a.conversation_id)=2 LIMIT 1;
 IF result_id IS NULL THEN
  INSERT INTO public.conversations(initiator_id,initiator_role) VALUES(auth.uid(),public.get_user_role(auth.uid())::text) RETURNING id INTO result_id;
  INSERT INTO public.conversation_participants(conversation_id,user_id) VALUES(result_id,auth.uid()),(result_id,p_recipient);
 END IF;
 RETURN result_id;
END; $$;
REVOKE ALL ON FUNCTION public.start_party_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_party_conversation(uuid) TO authenticated;

-- The existing role editor is owner-only; organizational appointments do not
-- permit promoting accounts or editing privilege definitions.
CREATE OR REPLACE FUNCTION public.protect_profile_privileges() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF current_user IN ('anon','authenticated') THEN
  IF NEW.role IS DISTINCT FROM OLD.role AND public.get_user_role(auth.uid())<>'admin' THEN RAISE EXCEPTION 'Only the owner can change system roles' USING ERRCODE='42501'; END IF;
  IF public.get_user_role(auth.uid()) NOT IN ('admin','yantrik','admin_party','board') AND
   (NEW.is_banned,NEW.banned_until,NEW.banned_at,NEW.banned_by,NEW.ban_reason,NEW.ban_expires_at,NEW.verified_at,NEW.verified_by) IS DISTINCT FROM (OLD.is_banned,OLD.banned_until,OLD.banned_at,OLD.banned_by,OLD.ban_reason,OLD.ban_expires_at,OLD.verified_at,OLD.verified_by)
  THEN RAISE EXCEPTION 'Only administrators can change account privileges' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END; $$;
NOTIFY pgrst,'reload schema';
