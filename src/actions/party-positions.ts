'use server';

import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/serverAdmin';
import { revalidatePath } from 'next/cache';
import { PARTY_PERMISSIONS, PartyPermission } from '@/lib/party-access';

async function ownerClient() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Please sign in.');
    const { data: role } = await supabase.rpc('get_user_role', { uid: user.id });
    const { data: active } = await supabase.rpc('has_party_permission', { permission_key: 'owner' });
    if (role !== 'admin' || !active) throw new Error('Only the owner can manage appointments.');
    return supabase;
}

export async function getPartyPositions() {
    const supabase = await ownerClient();
    const results = await Promise.all([
        supabase.from('party_positions').select('id,name,permissions').order('name'),
        supabase.from('party_appointments').select('id,position_id,profile_id,organization_level,unit_name,started_at,ended_at').order('started_at', { ascending: false }).limit(200),
        supabase.from('profiles').select('id,full_name,email').eq('is_banned', false).order('full_name').limit(1000),
    ]);
    for (const result of results) if (result.error) throw new Error(result.error.message);
    // Login emails are read only after the owner check; never copy them into
    // publicly readable profile columns.
    const { data: accounts, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw new Error(error.message);
    const emails = new Map(accounts.users.map(u => [u.id, u.email]));
    return { positions: results[0].data || [], appointments: results[1].data || [], members: (results[2].data || []).map(m => ({ ...m, email: emails.get(m.id) || m.email })) };
}

export async function savePartyPosition(id: string | null, name: string, permissions: PartyPermission[]) {
    const supabase = await ownerClient();
    if (!name.trim() || name.trim().length > 100 || permissions.some(p => !PARTY_PERMISSIONS.some(a => a.key === p))) throw new Error('Invalid position.');
    const payload = { name: name.trim(), permissions: [...new Set(permissions)] };
    const { error } = id
        ? await supabase.from('party_positions').update(payload).eq('id', id)
        : await supabase.from('party_positions').insert(payload);
    if (error) throw new Error(error.message);
    revalidatePath('/admin/positions');
}

export async function assignPartyPosition(positionId: string, profileId: string, level: string, unit: string) {
    const supabase = await ownerClient();
    const { error } = await supabase.rpc('assign_party_position', { p_position_id: positionId, p_profile_id: profileId, p_level: level, p_unit: unit });
    if (error) throw new Error(error.message);
    revalidatePath('/admin/positions');
}

export async function endPartyAppointment(id: string) {
    const supabase = await ownerClient();
    const { error } = await supabase.rpc('end_party_appointment', { p_id: id });
    if (error) throw new Error(error.message);
    revalidatePath('/admin/positions');
}
