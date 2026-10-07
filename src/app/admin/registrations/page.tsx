import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

async function ownerClient() {
    const supabase = await createClient();
    const { data: allowed, error } = await supabase.rpc('has_party_permission', { permission_key: 'owner' });
    if (error || !allowed) redirect('/');
    return supabase;
}
async function review(form: FormData) {
    'use server';
    const supabase = await ownerClient();
    const { error } = await supabase.rpc('review_membership_registration', { p_id: form.get('id'), p_status: form.get('status') });
    if (error) throw new Error('Review could not be saved. Please retry.');
    revalidatePath('/admin/registrations'); revalidatePath('/members'); revalidatePath('/join');
}
export default async function RegistrationsPage({ searchParams }: { searchParams: { page?: string } }) {
    const supabase = await ownerClient();
    const page = Math.min(10000, Math.max(1, Number(searchParams.page) || 1));
    const { data, error, count } = await supabase.from('members')
        .select('id,full_name_ne,phone,email,province_en,district_en,local_level_en,status,dob_original,dob_calendar,citizenship_number,motivation_text_ne,skills_text,confidentiality,created_at', { count: 'exact' })
        .order('created_at', { ascending: false }).range((page - 1) * 50, page * 50 - 1);
    if (error) throw new Error('Applications could not be loaded. Please retry.');
    return <main className="mx-auto max-w-5xl p-6 space-y-6">
        <h1 className="text-2xl font-bold">Membership registrations</h1>
        <p className="text-slate-600">{count || 0} applications. A short registration is an application, not verified membership. Check details with the applicant before approving. Only the owner can review applications here.</p>
        {!data?.length && <p className="rounded-xl border bg-white p-6">No applications on this page yet.</p>}
        {data?.map(m => <article key={m.id} className="rounded-xl border bg-white p-5 space-y-3">
            <h2 className="text-xl font-bold">{m.full_name_ne} <span className="text-sm font-normal">— {m.status}</span></h2>
            <p>{m.email} · {m.phone}</p><p>{m.province_en} / {m.district_en} / {m.local_level_en}</p>
            <p className="text-sm text-slate-600">Profile visibility: {m.confidentiality === 'public_ok' ? 'Applicant opted in; publish only on approval' : 'Private, including after approval'}</p>
            <details><summary className="cursor-pointer underline">Optional details</summary><div className="mt-2 space-y-2 whitespace-pre-wrap break-words">
                <p>Date of birth: {m.dob_original ? `${m.dob_original} (${m.dob_calendar})` : 'Not provided yet'}</p>
                <p>Citizenship number: {m.citizenship_number || 'Not provided yet'}</p>
                <p>Reason for joining: {m.motivation_text_ne || 'Not provided yet'}</p><p>Skills: {m.skills_text || 'Not provided yet'}</p>
            </div></details>
            <form action={review} className="flex gap-3"><input type="hidden" name="id" value={m.id} />
                <button name="status" value="approved" disabled={m.status === 'approved'} className="rounded bg-green-800 px-4 py-2 text-white disabled:opacity-40">Approve after verification</button>
                <button name="status" value="rejected" disabled={m.status === 'rejected'} className="rounded border border-red-700 px-4 py-2 text-red-700 disabled:opacity-40">Reject</button>
            </form>
        </article>)}
        <nav className="flex gap-6">{page > 1 && <a className="underline" href={`?page=${page - 1}`}>Previous</a>}{page * 50 < (count || 0) && <a className="underline" href={`?page=${page + 1}`}>Next</a>}</nav>
    </main>;
}
