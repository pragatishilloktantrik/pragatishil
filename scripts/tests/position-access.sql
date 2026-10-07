\set ON_ERROR_STOP on
BEGIN;
-- Fixtures are rolled back; no real accounts, posts or appointments are kept.
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('00000000-0000-4000-8000-000000000101','position-test-1@example.invalid','{"full_name":"Access fixture 1"}'),
 ('00000000-0000-4000-8000-000000000102','position-test-2@example.invalid','{"full_name":"Access fixture 2"}'),
 ('00000000-0000-4000-8000-000000000103','position-test-3@example.invalid','{"full_name":"Access fixture 3"}');
SELECT id AS owner_id FROM auth.users WHERE email='pragatishilloktantrik@gmail.com' \gset
SELECT id AS position_id FROM public.party_positions WHERE name='Sachiv / सचिव' \gset
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',:'owner_id','role','authenticated')::text,true);
SELECT public.assign_party_position(:'position_id','00000000-0000-4000-8000-000000000101','central','Access test') AS appointment_id \gset
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated"}',true);
DO $$ BEGIN
 IF NOT public.has_party_permission('news.publish') THEN RAISE EXCEPTION 'Appointed publisher denied'; END IF;
 IF public.get_user_role(auth.uid())<>'member' THEN RAISE EXCEPTION 'Appointment changed system role'; END IF;
 BEGIN
  UPDATE public.profiles SET role='admin' WHERE id=auth.uid();
  RAISE EXCEPTION 'Self-promotion was allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.assign_party_position((SELECT id FROM public.party_positions WHERE name='Sachiv / सचिव'),auth.uid(),'central','Unauthorized');
  RAISE EXCEPTION 'Non-owner assignment was allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
INSERT INTO public.news_items(title,source,type,link,status,content_type,visibility) VALUES('Access test','Party','Article','','published','official','public');
INSERT INTO public.media_gallery(type,url,media_type) VALUES('image','https://example.invalid/access-test.png','image');
SELECT public.start_party_conversation('00000000-0000-4000-8000-000000000102') AS conversation_id \gset
INSERT INTO public.direct_messages(conversation_id,sender_id,content) VALUES(:'conversation_id',auth.uid(),'Access test');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000103","role":"authenticated"}',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.conversations) OR EXISTS(SELECT 1 FROM public.direct_messages) THEN RAISE EXCEPTION 'Outsider could read private chat'; END IF;
 BEGIN
  INSERT INTO public.conversation_participants(conversation_id,user_id) VALUES('00000000-0000-4000-8000-000000000001',auth.uid());
  RAISE EXCEPTION 'Outsider could join a conversation';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE public.conversation_participants SET conversation_id='00000000-0000-4000-8000-000000000001' WHERE user_id=auth.uid();
  RAISE EXCEPTION 'Conversation membership could be moved';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.news_items(title,source,type,link,status,content_type,visibility) VALUES('Unauthorized','Party','Article','','published','official','public');
  RAISE EXCEPTION 'Ordinary member could publish official news';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',:'owner_id','role','authenticated')::text,true);
SELECT public.assign_party_position(:'position_id','00000000-0000-4000-8000-000000000102','central','Access test');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated"}',true);
DO $$ BEGIN
 IF public.has_party_permission('news.publish') OR public.has_party_permission('chat.use') THEN RAISE EXCEPTION 'Former holder retained position access'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000102","role":"authenticated"}',true);
DO $$ BEGIN
 IF NOT public.has_party_permission('news.publish') THEN RAISE EXCEPTION 'Replacement holder missing access'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
\echo 'PASS: owner-only appointments, publishing, private chat, and replacement revocation'
