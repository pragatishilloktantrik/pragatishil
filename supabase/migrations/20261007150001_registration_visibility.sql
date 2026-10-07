-- A regular account cannot publish a pending membership profile through profile settings.
CREATE FUNCTION public.protect_registration_visibility() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.is_public AND NEW.role = 'member' AND NOT EXISTS (
        SELECT 1 FROM public.members WHERE auth_user_id = NEW.id AND status = 'approved'
    ) THEN
        RAISE EXCEPTION 'Public member profiles require an approved application' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_registration_visibility() FROM PUBLIC;
CREATE TRIGGER protect_registration_visibility BEFORE INSERT OR UPDATE OF is_public ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_registration_visibility();
