-- Keep feedback private after publication; the audit retains the review note.
CREATE OR REPLACE FUNCTION public.review_member_article(p_id bigint,p_decision text,p_note text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v news_items;
BEGIN
 IF NOT can_review_articles() THEN RAISE EXCEPTION 'Article review permission required.'; END IF;
 IF p_decision NOT IN ('published','rejected') OR p_decision IS NULL OR length(coalesce(p_note,''))>2000 THEN RAISE EXCEPTION 'Invalid review decision or note.'; END IF;
 IF p_decision='rejected' AND length(trim(coalesce(p_note,'')))=0 THEN RAISE EXCEPTION 'Explain which changes the author should make.'; END IF;
 SELECT * INTO v FROM news_items WHERE id=p_id AND content_type='article' FOR UPDATE;
 IF NOT FOUND OR v.status<>'submitted' THEN RAISE EXCEPTION 'This article is no longer awaiting review.'; END IF;
 IF v.author_id=auth.uid() AND get_user_role(auth.uid())<>'admin' THEN RAISE EXCEPTION 'Another editor or the owner must review your article.'; END IF;
 UPDATE news_items SET status=p_decision,is_published=(p_decision='published'),visibility='public',published_at=CASE WHEN p_decision='published' THEN now() ELSE NULL END,review_note=CASE WHEN p_decision='rejected' THEN trim(coalesce(p_note,'')) ELSE NULL END,reviewed_by=auth.uid(),reviewed_at=now() WHERE id=p_id;
 INSERT INTO notifications(user_id,type,title,body,link,actor_id,reference_id) VALUES(v.author_id,CASE WHEN p_decision='published' THEN 'article_approved' ELSE 'article_changes_requested' END,CASE WHEN p_decision='published' THEN 'Your article is published / लेख प्रकाशित भयो' ELSE 'Article needs changes / लेखमा सुधार आवश्यक' END,left(v.title,200),CASE WHEN p_decision='published' THEN '/blogs/'||v.slug ELSE '/blogs/write?edit='||v.id END,auth.uid(),v.id::text);
 INSERT INTO audit_logs(actor_id,action_type,target_type,target_id,metadata) VALUES(auth.uid(),'MANAGE_NEWS','news_items',v.id::text,jsonb_build_object('action','review_member_article','decision',p_decision,'note',p_note));
END; $$;
