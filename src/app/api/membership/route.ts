import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { draftSchema, registrationErrors } from '@/lib/membership-registration';

export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    const [draft, member] = await Promise.all([
        supabase.from('membership_drafts').select('data').eq('profile_id', user.id).maybeSingle(),
        supabase.from('members').select('id,status,meta,full_name_ne,phone,dob_original,dob_calendar,citizenship_number,motivation_text_ne,skills_text,confidentiality').eq('auth_user_id', user.id).maybeSingle(),
    ]);
    if (draft.error || member.error) return NextResponse.json({ error: 'Could not load your saved details. Please retry.' }, { status: 500 });
    const m = member.data;
    const saved = m ? {
        name: m.full_name_ne, phone: m.phone, provinceId: m.meta?.geoProvinceId || '',
        districtId: m.meta?.geoDistrictId || '', localLevelId: m.meta?.geoLocalLevelId || '', ward: m.meta?.ward || '',
        dob: m.dob_original || '', dobCalendar: m.dob_calendar, citizenship: m.citizenship_number || '',
        motivation: m.motivation_text_ne || '', skills: m.skills_text || '',
        publicProfile: m.confidentiality === 'public_ok', consent: true,
    } : {};
    return NextResponse.json({ draft: draft.data?.data || saved, status: m?.status || null }, { headers: { 'Cache-Control': 'no-store' } });
}

async function save(req: NextRequest, submit: boolean) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Please sign in again to save.' }, { status: 401 });
    let body;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 }); }
    const parsed = draftSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Please check the length and format of your details.' }, { status: 400 });
    const data = parsed.data;
    if (submit) {
        const errors = registrationErrors(data);
        if (Object.keys(errors).length) return NextResponse.json({ error: 'Please check the highlighted fields.', errors }, { status: 400 });
        data.phone = data.phone.replace(/[०-९]/g, c => String('०१२३४५६७८९'.indexOf(c))).replace(/[\s()-]/g, '');
        const { data: id, error } = await supabase.rpc('save_membership_registration', { p_data: data });
        if (error) return NextResponse.json({ error: 'Could not submit. Check your location and try again; your draft is kept.' }, { status: 400 });
        return NextResponse.json({ id, status: 'pending' });
    }
    const { error } = await supabase.from('membership_drafts').upsert({ profile_id: user.id, data, updated_at: new Date().toISOString() });
    if (error) return NextResponse.json({ error: 'Draft was not saved. Please retry before leaving this page.' }, { status: 500 });
    return NextResponse.json({ saved: true });
}
export async function PUT(req: NextRequest) { return save(req, false); }
export async function POST(req: NextRequest) { return save(req, true); }
