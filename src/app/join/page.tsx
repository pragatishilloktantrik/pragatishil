'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { NestedProvince } from '@/lib/geo';
import { emptyDraft, RegistrationDraft, registrationErrors } from '@/lib/membership-registration';

export default function JoinPage() {
    const supabase = useMemo(() => createClient(), []);
    const [user, setUser] = useState<User | null>(null);
    const [ready, setReady] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [geo, setGeo] = useState<NestedProvince[]>([]);
    const [form, setForm] = useState<RegistrationDraft>(emptyDraft);
    const [dirty, setDirty] = useState(false);
    const [saveState, setSaveState] = useState('');
    const [status, setStatus] = useState<string | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [received, setReceived] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout>>();
    const saving = useRef<Promise<void>>(Promise.resolve());

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const { data: { user }, error } = await supabase.auth.getUser();
                if (error && error.name !== 'AuthSessionMissingError') throw error;
                if (!active) return;
                setUser(user);
                if (user) {
                    const [savedResponse, geoResponse] = await Promise.all([fetch('/api/membership'), fetch('/api/geo/structure')]);
                    if (!savedResponse.ok || !geoResponse.ok) throw new Error('Could not load your saved details. Please retry.');
                    const [saved, locations] = await Promise.all([savedResponse.json(), geoResponse.json()]);
                    if (!active) return;
                    setForm({ ...emptyDraft, name: user.user_metadata?.full_name || '', ...saved.draft });
                    setStatus(saved.status);
                    setGeo(locations.provinces || []);
                }
                setReady(true);
            } catch {
                if (active) setLoadError('विवरण लोड भएन / Could not load your details. Please retry.');
            }
        })();
        return () => { active = false; };
    }, [supabase]);

    useEffect(() => {
        if (!ready || !user || !dirty || submitting || received) return;
        setSaveState('सुरक्षित गर्दै… / Saving…');
        timer.current = setTimeout(() => {
            saving.current = saving.current.then(async () => {
                try {
                    const res = await fetch('/api/membership', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
                    if (!res.ok) throw new Error();
                    setSaveState('मस्यौदा सुरक्षित भयो / Draft saved');
                } catch { setSaveState('मस्यौदा सुरक्षित भएन — पुनः प्रयास गर्नुहोस् / Draft not saved — retry before leaving.'); }
            });
        }, 1000);
        return () => clearTimeout(timer.current);
    }, [form, ready, user, dirty, submitting, received]);

    const districts = geo.find(p => String(p.id) === form.provinceId)?.districts || [];
    const localLevels = districts.find(d => String(d.id) === form.districtId)?.localLevels || [];
    const locality = localLevels.find(l => String(l.id) === form.localLevelId);
    function change<K extends keyof RegistrationDraft>(key: K, value: RegistrationDraft[K]) {
        setForm(f => ({ ...f, [key]: value,
            ...(key === 'provinceId' ? { districtId: '', localLevelId: '', ward: '' } : {}),
            ...(key === 'districtId' ? { localLevelId: '', ward: '' } : {}),
            ...(key === 'localLevelId' ? { ward: '' } : {}),
        }));
        setDirty(true); setReceived(false); setErrors({}); setError('');
    }
    async function submit(e: FormEvent) {
        e.preventDefault();
        const validation = registrationErrors(form);
        setErrors(validation);
        if (Object.keys(validation).length) {
            const field = document.getElementById(Object.keys(validation)[0]);
            const details = field?.closest('details');
            if (details) details.open = true;
            field?.focus();
            return;
        }
        clearTimeout(timer.current);
        setSubmitting(true); setError('');
        await saving.current;
        try {
            const res = await fetch('/api/membership', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
            const data = await res.json();
            if (!res.ok) { setErrors(data.errors || {}); throw new Error(data.error || 'Please try again.'); }
            setStatus('pending'); setReceived(true); setDirty(false); setSaveState('');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) { setError(err instanceof Error ? err.message : 'Please try again.'); }
        finally { setSubmitting(false); }
    }
    const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600';
    const fieldError = (key: string) => errors[key] ? <span id={`${key}-error`} className="mt-1 block text-sm text-red-700">{errors[key]}</span> : null;
    const accessibility = (key: string) => ({ 'aria-invalid': !!errors[key], 'aria-describedby': errors[key] ? `${key}-error` : undefined });

    return <main className="min-h-screen bg-slate-50 px-4 py-12">
        <div className="mx-auto max-w-2xl space-y-6">
            <header><h1 className="text-3xl font-bold text-slate-900">सदस्यता दर्ता / Member registration</h1>
                <p className="mt-3 text-slate-600">सुरुमा छोटो विवरण भर्नुहोस्। बाँकी विवरण पछि थप्न सक्नुहुन्छ।<br />Start with a few details. You can return later to complete them.</p></header>
            {loadError ? <div role="alert" className="rounded-xl bg-red-50 p-6">{loadError}<button className="ml-3 underline" onClick={() => window.location.reload()}>पुनः प्रयास / Retry</button></div> : !ready ? <p role="status">लोड हुँदैछ / Loading…</p> : !user ?
                <section className="rounded-xl border bg-white p-6 space-y-4"><p>आफ्नो Google खाताबाट सुरु गर्नुहोस् / Start with your Google account.</p>
                    <button className="rounded-lg bg-blue-700 px-6 py-3 font-semibold text-white" onClick={async () => {
                        const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback?next=/join` } });
                        if (error) setError('Sign-in could not start. Please retry.');
                    }}>Google बाट जारी राख्नुहोस् / Continue with Google</button>
                    {error && <p role="alert" className="text-red-700">{error}</p>}
                    <p className="text-sm text-slate-600">लगइन मात्र गर्दा सदस्यता स्वीकृत हुँदैन। / Signing in alone does not approve membership.</p>
                </section> : <>
                    {status && <section role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-5">
                        <h2 className="font-bold">{received ? 'दर्ता प्राप्त भयो / Registration received' : 'तपाईंको आवेदन / Your application'}</h2>
                        <p className="mt-2">{status === 'approved' ? 'स्वीकृत / Approved. Saving changes will send your application for review again.' : status === 'rejected' ? 'पुनरावलोकन आवश्यक / Please contact the party or update your details for another review.' : 'समीक्षाको प्रतीक्षामा / Pending review. Registration is not yet approved membership.'}</p>
                        {received && <p className="mt-2">बाँकी विवरण पछि यही पृष्ठमा फर्केर भर्न सक्नुहुन्छ। / Return to this page whenever you are ready to add details.</p>}
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                            <Link href="/commune" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-brand-blue px-5 py-3 text-center font-semibold text-white transition-colors hover:bg-brand-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2">समुदायमा जानुहोस् / Visit the community</Link>
                            <Link href="/members" className="inline-flex min-h-12 items-center justify-center rounded-lg border-2 border-brand-blue bg-white px-5 py-3 text-center font-semibold text-brand-blue transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2">अन्य सदस्यहरू हेर्नुहोस् / See other members</Link>
                        </div>
                    </section>}
                    <form noValidate onSubmit={submit} className="space-y-6 rounded-xl border bg-white p-6 shadow-sm">
                        <p className="text-sm text-slate-600 break-words">Google: {user.email} · इमेल स्वतः सुरक्षित हुन्छ / Email is saved from your account.</p>
                        <p className="text-sm font-medium">* आवश्यक / Required</p>
                        <label className="block font-medium" htmlFor="name">पूरा नाम / Full name *
                            <input id="name" autoComplete="name" maxLength={150} value={form.name} onChange={e => change('name', e.target.value)} className={inputClass} {...accessibility('name')} />{fieldError('name')}</label>
                        <label className="block font-medium" htmlFor="phone">फोन नम्बर / Phone number *
                            <input id="phone" type="tel" autoComplete="tel" maxLength={30} placeholder="98XXXXXXXX" value={form.phone} onChange={e => change('phone', e.target.value)} className={inputClass} {...accessibility('phone')} />{fieldError('phone')}</label>
                        <label className="block font-medium" htmlFor="provinceId">प्रदेश / Province *
                            <select id="provinceId" value={form.provinceId} onChange={e => change('provinceId', e.target.value)} className={inputClass} {...accessibility('provinceId')}><option value="">छान्नुहोस् / Select</option>{geo.map(p => <option key={p.id} value={p.id}>{p.name_en}</option>)}</select>{fieldError('provinceId')}</label>
                        <label className="block font-medium" htmlFor="districtId">जिल्ला / District *
                            <select id="districtId" disabled={!form.provinceId} value={form.districtId} onChange={e => change('districtId', e.target.value)} className={inputClass} {...accessibility('districtId')}><option value="">छान्नुहोस् / Select</option>{districts.map(d => <option key={d.id} value={d.id}>{d.name_en}</option>)}</select>{fieldError('districtId')}</label>
                        <label className="block font-medium" htmlFor="localLevelId">पालिका / Municipality *
                            <select id="localLevelId" disabled={!form.districtId} value={form.localLevelId} onChange={e => change('localLevelId', e.target.value)} className={inputClass} {...accessibility('localLevelId')}><option value="">छान्नुहोस् / Select</option>{localLevels.map(l => <option key={l.id} value={l.id}>{l.name_en}</option>)}</select>{fieldError('localLevelId')}</label>
                        <details className="rounded-lg border p-4"><summary className="cursor-pointer font-semibold">थप विवरण — पछि भर्न सकिन्छ / More details — optional for now</summary>
                            <div className="mt-5 space-y-5">
                                <label className="block" htmlFor="ward">वडा / Ward<select id="ward" value={form.ward} disabled={!locality} onChange={e => change('ward', e.target.value)} className={inputClass}><option value="">पछि / Later</option>{Array.from({ length: locality?.num_wards || 0 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select></label>
                                <label className="block" htmlFor="dobCalendar">जन्ममिति पात्रो / Date calendar<select id="dobCalendar" value={form.dobCalendar} onChange={e => change('dobCalendar', e.target.value as RegistrationDraft['dobCalendar'])} className={inputClass} {...accessibility('dobCalendar')}><option value="unknown">पछि / Later</option><option value="AD">AD</option><option value="BS">BS</option></select>{fieldError('dobCalendar')}</label>
                                <label className="block" htmlFor="dob">जन्ममिति / Date of birth<input id="dob" placeholder="YYYY-MM-DD" maxLength={30} value={form.dob} onChange={e => change('dob', e.target.value)} className={inputClass} /></label>
                                <label className="block" htmlFor="citizenship">नागरिकता नम्बर / Citizenship number<input id="citizenship" maxLength={100} value={form.citizenship} onChange={e => change('citizenship', e.target.value)} className={inputClass} /><span className="text-sm text-slate-600">सार्वजनिक हुँदैन। अहिले परिचयपत्रको तस्बिर चाहिँदैन। / Kept private. No ID photo needed now.</span></label>
                                <label className="block" htmlFor="motivation">किन जोडिन चाहनुहुन्छ? / Why would you like to join?<textarea id="motivation" rows={3} maxLength={2000} value={form.motivation} onChange={e => change('motivation', e.target.value)} className={inputClass} /></label>
                                <label className="block" htmlFor="skills">सीप / Skills<textarea id="skills" rows={2} maxLength={1000} value={form.skills} onChange={e => change('skills', e.target.value)} className={inputClass} /></label>
                            </div>
                        </details>
                        <label className="flex gap-3 items-start"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" checked={form.publicProfile} onChange={e => change('publicProfile', e.target.checked)} /><span>स्वीकृत भएपछि मेरो प्रोफाइल सदस्य सूचीमा देखाउन चाहन्छु।<br /><span className="text-sm text-slate-600">Optional: show my profile in the member directory after approval. Leave unchecked to keep it private.</span></span></label>
                        <div><label className="flex gap-3 items-start" htmlFor="consent"><input id="consent" className="mt-1 h-5 w-5 shrink-0" type="checkbox" checked={form.consent} onChange={e => change('consent', e.target.checked)} {...accessibility('consent')} /><span>यो राजनीतिक दलको सदस्यता आवेदन हो भन्ने बुझेको छु र दिएको विवरण प्रयोग गर्न सहमत छु। *<br /><span className="text-sm text-slate-600">I understand this is a political party membership application and consent to the use of these details as described in the <Link href="/privacy" className="underline">privacy policy</Link> and <Link href="/terms" className="underline">terms</Link>.</span></span></label>{fieldError('consent')}</div>
                        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
                        <p role="status" aria-live="polite" className="text-sm text-slate-600">{saveState}</p>
                        {saveState.includes('not saved') && <button type="button" className="underline" onClick={() => setForm(f => ({ ...f }))}>मस्यौदा फेरि सुरक्षित गर्नुहोस् / Retry saving draft</button>}
                        <button disabled={submitting || (received && !dirty)} type="submit" className="w-full rounded-lg bg-blue-700 p-4 font-bold text-white disabled:opacity-50">{submitting ? 'पठाउँदै… / Submitting…' : status ? 'विवरण पठाउनुहोस् / Submit updated details' : 'दर्ता गर्नुहोस् / Register'}</button>
                        <p className="text-sm text-slate-600">मस्यौदा स्वतः सुरक्षित हुन्छ। दर्ता पठाएपछि पार्टीले समीक्षा गर्छ। / Drafts save automatically. The party reviews submitted registrations.</p>
                    </form>
                </>}
        </div>
    </main>;
}
