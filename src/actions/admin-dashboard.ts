'use server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/serverAdmin';
import { canAccessAdminPath, PartyPermission } from '@/lib/party-access';

export async function getAdminDashboard() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Please sign in');
    const { data: profile } = await supabase.from('profiles').select('role,is_banned').eq('id', user.id).single();
    const permissions: PartyPermission[] = [];
    for (const key of ['news.publish', 'media.publish'] as PartyPermission[]) {
        const { data } = await supabase.rpc('has_party_permission', { permission_key: key });
        if (data) permissions.push(key);
    }
    const role = profile?.role || 'guest';
    if (profile?.is_banned || !canAccessAdminPath('/admin', role, permissions)) throw new Error('Dashboard access required');
    const results = await Promise.all([
        canAccessAdminPath('/admin/news', role, permissions) ? supabase.from('news_items').select('id', { count: 'exact', head: true }) : Promise.resolve(null),
        canAccessAdminPath('/admin/media', role, permissions) ? supabase.from('media_gallery').select('id', { count: 'exact', head: true }) : Promise.resolve(null),
        role === 'admin' ? supabaseAdmin.from('members').select('id', { count: 'exact', head: true }) : Promise.resolve(null),
    ]);
    for (const r of results) if (r?.error) throw new Error(r.error.message);
    return { owner: role === 'admin', news: results[0]?.count ?? null, media: results[1]?.count ?? null, members: results[2]?.count ?? null };
}
