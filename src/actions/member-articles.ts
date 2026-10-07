'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function getArticleWorkspace() {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return { signedIn: false, eligible: false, articles: [] };
    const { data: eligible, error: permissionError } = await db.rpc('can_submit_member_article');
    if (permissionError) throw new Error('Unable to check article access. Please try again.');
    const { data, error } = await db.from('news_items').select('id,slug,title,body_en,summary_en,status,review_note,created_at').eq('content_type', 'article').eq('author_id', user.id).order('created_at', { ascending: false }).limit(100);
    if (error) throw new Error('Unable to load your articles. Please try again.');
    return { signedIn: true, eligible: !!eligible, articles: data || [] };
}

export async function saveMemberArticle(input: { id: number | null; title: string; body: string; summary: string; submit: boolean }) {
    const db = await createClient();
    const { data, error } = await db.rpc('save_member_article', { p_id: input.id, p_title: input.title, p_body: input.body, p_summary: input.summary, p_submit: input.submit });
    if (error) throw new Error(error.message);
    revalidatePath('/blogs/write'); revalidatePath('/admin/reviews');
    return data as { id: number; slug: string; status: string };
}

export async function getArticleReviewQueue(offset = 0) {
    const db = await createClient();
    const { data: allowed, error: permissionError } = await db.rpc('can_review_articles');
    if (permissionError || !allowed) throw new Error('Article review permission required.');
    const start = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    const { data, error, count } = await db.from('news_items').select('id,slug,title,author_name,summary_en,created_at,author_id', { count: 'exact' }).eq('content_type', 'article').eq('status', 'submitted').order('created_at', { ascending: true }).range(start, start + 19);
    if (error) throw new Error('Unable to load the article queue. Please try again.');
    const { data: { user } } = await db.auth.getUser();
    const { data: role } = await db.rpc('get_user_role', { uid: user?.id });
    return { articles: data || [], count: count || 0, userId: user?.id, owner: role === 'admin' };
}

export async function reviewMemberArticle(id: number, decision: 'published' | 'rejected', note: string) {
    const db = await createClient();
    const { error } = await db.rpc('review_member_article', { p_id: id, p_decision: decision, p_note: note });
    if (error) throw new Error(error.message);
    revalidatePath('/blogs', 'layout'); revalidatePath('/admin/reviews'); revalidatePath('/admin');
}
