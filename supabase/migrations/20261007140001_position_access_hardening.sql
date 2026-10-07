-- Only the read marker is client-editable; moving a membership row must never
-- allow a user to join another conversation.
REVOKE UPDATE ON public.conversation_participants FROM authenticated,anon;
GRANT UPDATE(last_read_at) ON public.conversation_participants TO authenticated;

CREATE FUNCTION public.audit_party_position_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.audit_logs(actor_id,action_type,action,target_type,target_id,old_data,new_data)
 VALUES(auth.uid(),'UPDATE_SETTINGS','CHANGE_POSITION_PERMISSIONS','party_position',NEW.id::text,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));
 RETURN NEW;
END; $$;
CREATE TRIGGER audit_party_position_change AFTER INSERT OR UPDATE ON public.party_positions FOR EACH ROW EXECUTE FUNCTION public.audit_party_position_change();
NOTIFY pgrst,'reload schema';
