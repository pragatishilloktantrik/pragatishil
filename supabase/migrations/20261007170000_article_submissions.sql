-- Member articles use private drafts and an atomic, permission-checked review workflow.
ALTER TABLE public.party_positions DROP CONSTRAINT party_positions_permissions_check;
ALTER TABLE public.party_positions ADD CONSTRAINT party_positions_permissions_check CHECK (permissions <@ ARRAY['news.publish','media.publish','chat.use','articles.review']::text[]);
INSERT INTO public.party_positions(name,permissions) VALUES ('Editor / सम्पादक',ARRAY['articles.review']) ON CONFLICT DO NOTHING;
ALTER TABLE public.news_items DROP CONSTRAINT news_items_status_check;
ALTER TABLE public.news_items ADD CONSTRAINT news_items_status_check CHECK (status IN ('draft','submitted','published','rejected','archived'));
ALTER TABLE public.news_items ADD COLUMN review_note text, ADD COLUMN reviewed_by uuid REFERENCES public.profiles(id), ADD COLUMN reviewed_at timestamptz;

CREATE FUNCTION public.can_submit_member_article() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND NOT coalesce(is_banned,false)) AND
 (get_user_role(auth.uid())='admin' OR EXISTS(SELECT 1 FROM members WHERE auth_user_id=auth.uid() AND status IN ('pending','approved')));
$$;
CREATE FUNCTION public.can_review_articles() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT has_party_permission('articles.review'); $$;
REVOKE ALL ON FUNCTION public.can_submit_member_article(), public.can_review_articles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_submit_member_article(), public.can_review_articles() TO authenticated;

DROP POLICY "News: manage own articles" ON public.news_items;
DROP POLICY "News: manage any article (admin/yantrik)" ON public.news_items;
DROP POLICY "Appointed article publishers" ON public.news_items;
CREATE POLICY "Authors read their articles" ON public.news_items FOR SELECT TO authenticated USING(content_type='article' AND author_id=auth.uid());
CREATE POLICY "Editors read submitted articles" ON public.news_items FOR SELECT TO authenticated USING(content_type='article' AND status IN ('submitted','published','rejected') AND can_review_articles());
-- No direct author/editor writes: only the RPCs below can change member articles.

ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK(type IN ('mention','follow','comment','like','new_post','new_article','thread_reply','dm','article_submitted','article_approved','article_changes_requested'));
DROP POLICY "Notifications: System can insert" ON public.notifications;
CREATE POLICY "Clients insert ordinary notifications" ON public.notifications FOR INSERT WITH CHECK(type NOT IN ('article_submitted','article_approved','article_changes_requested'));

CREATE FUNCTION public.save_member_article(p_id bigint, p_title text, p_body text, p_summary text, p_submit boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v news_items; v_author text;
BEGIN
 IF NOT can_submit_member_article() THEN RAISE EXCEPTION 'Submit your membership registration before writing articles.'; END IF;
 IF p_submit IS NULL OR length(trim(coalesce(p_title,''))) NOT BETWEEN 1 AND 200 OR length(coalesce(p_body,''))>50000 OR length(coalesce(p_summary,''))>1000 THEN RAISE EXCEPTION 'Enter a title (up to 200 characters), article (up to 50,000), and optional summary (up to 1,000).'; END IF;
 IF p_submit AND length(trim(coalesce(p_body,'')))<20 THEN RAISE EXCEPTION 'Please write at least 20 characters before submitting.'; END IF;
 SELECT coalesce(nullif(full_name,''),'Member') INTO v_author FROM profiles WHERE id=auth.uid();
 IF p_id IS NOT NULL THEN
  SELECT * INTO v FROM news_items WHERE id=p_id AND content_type='article' AND author_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Article not found or access denied.'; END IF;
  IF v.status NOT IN ('draft','rejected') THEN RAISE EXCEPTION 'Submitted and published articles cannot be edited. Wait for the review or start a new draft.'; END IF;
  UPDATE news_items SET title=trim(p_title),body_en=p_body,summary_en=p_summary,status=CASE WHEN p_submit THEN 'submitted' ELSE 'draft' END,is_published=false,review_note=NULL,reviewed_by=NULL,reviewed_at=NULL WHERE id=p_id RETURNING * INTO v;
 ELSE
  INSERT INTO news_items(title,body_en,summary_en,source,type,link,content_type,visibility,author_id,author_name,slug,status,is_published)
  VALUES(trim(p_title),p_body,p_summary,'Member contribution','Article','','article','public',auth.uid(),v_author,'article-'||gen_random_uuid(),CASE WHEN p_submit THEN 'submitted' ELSE 'draft' END,false) RETURNING * INTO v;
 END IF;
 IF p_submit THEN
  INSERT INTO notifications(user_id,type,title,body,link,actor_id,reference_id)
  SELECT DISTINCT p.id,'article_submitted','Article awaiting review',left(v.title,200),'/admin/reviews',auth.uid(),v.id::text FROM profiles p
  WHERE NOT coalesce(p.is_banned,false) AND (p.role='admin' OR EXISTS(SELECT 1 FROM party_appointments a JOIN party_positions pos ON pos.id=a.position_id WHERE a.profile_id=p.id AND a.ended_at IS NULL AND 'articles.review'=ANY(pos.permissions)));
 END IF;
 RETURN jsonb_build_object('id',v.id,'slug',v.slug,'status',v.status);
END; $$;

CREATE FUNCTION public.review_member_article(p_id bigint,p_decision text,p_note text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v news_items;
BEGIN
 IF NOT can_review_articles() THEN RAISE EXCEPTION 'Article review permission required.'; END IF;
 IF p_decision NOT IN ('published','rejected') OR p_decision IS NULL OR length(coalesce(p_note,''))>2000 THEN RAISE EXCEPTION 'Invalid review decision or note.'; END IF;
 IF p_decision='rejected' AND length(trim(coalesce(p_note,'')))=0 THEN RAISE EXCEPTION 'Explain which changes the author should make.'; END IF;
 SELECT * INTO v FROM news_items WHERE id=p_id AND content_type='article' FOR UPDATE;
 IF NOT FOUND OR v.status<>'submitted' THEN RAISE EXCEPTION 'This article is no longer awaiting review.'; END IF;
 IF v.author_id=auth.uid() AND get_user_role(auth.uid())<>'admin' THEN RAISE EXCEPTION 'Another editor or the owner must review your article.'; END IF;
 UPDATE news_items SET status=p_decision,is_published=(p_decision='published'),visibility='public',published_at=CASE WHEN p_decision='published' THEN now() ELSE NULL END,review_note=trim(coalesce(p_note,'')),reviewed_by=auth.uid(),reviewed_at=now() WHERE id=p_id;
 INSERT INTO notifications(user_id,type,title,body,link,actor_id,reference_id) VALUES(v.author_id,CASE WHEN p_decision='published' THEN 'article_approved' ELSE 'article_changes_requested' END,CASE WHEN p_decision='published' THEN 'Your article is published / लेख प्रकाशित भयो' ELSE 'Article needs changes / लेखमा सुधार आवश्यक' END,left(v.title,200),CASE WHEN p_decision='published' THEN '/blogs/'||v.slug ELSE '/blogs/write?edit='||v.id END,auth.uid(),v.id::text);
 INSERT INTO audit_logs(actor_id,action_type,target_type,target_id,metadata) VALUES(auth.uid(),'MANAGE_NEWS','news_items',v.id::text,jsonb_build_object('action','review_member_article','decision',p_decision,'note',p_note));
END; $$;
REVOKE ALL ON FUNCTION public.save_member_article(bigint,text,text,text,boolean),public.review_member_article(bigint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_member_article(bigint,text,text,text,boolean),public.review_member_article(bigint,text,text) TO authenticated;
CREATE INDEX news_items_article_review_queue ON public.news_items(created_at DESC) WHERE content_type='article' AND status='submitted';
