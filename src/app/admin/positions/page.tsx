'use client';

import { useEffect, useState } from 'react';
import { assignPartyPosition, endPartyAppointment, getPartyPositions, savePartyPosition } from '@/actions/party-positions';
import { PARTY_PERMISSIONS, PartyPermission } from '@/lib/party-access';

type Position = { id: string; name: string; permissions: PartyPermission[] };
type Appointment = { id: string; position_id: string; profile_id: string; organization_level: string; unit_name: string; started_at: string; ended_at: string | null };
type Member = { id: string; full_name: string | null; email: string | null };

export default function PositionsPage() {
    const [positions, setPositions] = useState<Position[]>([]);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [positionId, setPositionId] = useState('');
    const [memberId, setMemberId] = useState('');
    const [level, setLevel] = useState('central');
    const [unit, setUnit] = useState('Central');
    const [search, setSearch] = useState('');
    const [editing, setEditing] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [permissions, setPermissions] = useState<PartyPermission[]>([]);
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [history, setHistory] = useState(false);
    async function load() {
        const data = await getPartyPositions();
        setPositions(data.positions as Position[]); setAppointments(data.appointments as Appointment[]); setMembers(data.members as Member[]);
    }
    useEffect(() => { load().catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
    async function run(action: () => Promise<void>, success: string) {
        setBusy(true); setError(''); setMessage('');
        try { await action(); await load(); setMessage(success); }
        catch (e) { setError((e as Error).message); }
        finally { setBusy(false); }
    }
    const selected = positions.find(p => p.id === positionId);
    const incumbent = appointments.find(a => !a.ended_at && a.position_id === positionId && a.organization_level === level && a.unit_name.toLowerCase() === unit.trim().toLowerCase());
    const memberLabel = (id: string) => { const m = members.find(m => m.id === id); return m ? `${m.full_name || 'Member'}${m.email ? ` · ${m.email}` : ''}` : 'Former / inactive member'; };
    const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2';
    if (loading) return <p>Loading positions…</p>;
    return <div className="max-w-5xl space-y-6">
        <div><h1 className="text-2xl font-bold">Positions & access / पद र पहुँच</h1>
            <p className="mt-2 text-slate-600">Appoint existing members to organizational positions. Replacing an office bearer ends the previous appointment and its access. Each person keeps their own Google login.</p></div>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
        {message && <p role="status" className="rounded-lg bg-green-50 p-3 text-green-800">{message}</p>}
        <section className="rounded-xl border bg-white p-5 space-y-4">
            <h2 className="text-lg font-semibold">Assign or replace an office bearer</h2>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); run(() => assignPartyPosition(positionId, memberId, level, unit), 'Appointment saved. Access takes effect on the next request.'); }}>
                <div className="grid gap-4 md:grid-cols-2">
                    <label>Position<select className={field} required value={positionId} onChange={e => setPositionId(e.target.value)}><option value="">Choose position</option>{positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
                    <label>Organizational level<select className={field} value={level} onChange={e => { setLevel(e.target.value); setUnit(e.target.value === 'central' ? 'Central' : ''); }}>{['central', 'province', 'district', 'palika', 'ward', 'department'].map(l => <option key={l} value={l}>{l}</option>)}</select></label>
                    <label>Committee / area name<input className={field} required maxLength={100} value={unit} onChange={e => setUnit(e.target.value)} placeholder="e.g. Central, Bagmati, Kathmandu Ward 10" /></label>
                    <label>Find member<input className={field} value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or email" /></label>
                </div>
                <label className="block">Member<select className={field} required value={memberId} onChange={e => setMemberId(e.target.value)}><option value="">Choose a member who has signed in</option>{members.filter(m => m.id === memberId || `${m.full_name} ${m.email}`.toLowerCase().includes(search.toLowerCase())).map(m => <option key={m.id} value={m.id}>{memberLabel(m.id)}</option>)}</select></label>
                {selected && <p className="text-sm text-slate-600">Access: {selected.permissions.map(p => PARTY_PERMISSIONS.find(a => a.key === p)?.label).join(', ') || 'Position title only'}. Publishing permissions apply across the website. Private channel membership is managed separately.</p>}
                {incumbent && <p className="rounded bg-amber-50 p-3 text-amber-900">This will replace {memberLabel(incumbent.profile_id)} in this position and area.</p>}
                <button disabled={busy} className="rounded-lg bg-blue-700 px-4 py-2 text-white disabled:opacity-50">{busy ? 'Saving…' : incumbent ? 'Replace office bearer' : 'Assign position'}</button>
            </form>
        </section>
        <section className="rounded-xl border bg-white p-5 space-y-4">
            <div className="flex flex-wrap justify-between gap-3"><h2 className="text-lg font-semibold">{history ? 'Appointment history' : 'Current office bearers'}</h2><button className="text-blue-700 underline" onClick={() => setHistory(!history)}>{history ? 'Show current' : 'Show history'}</button></div>
            <div className="space-y-3">{appointments.filter(a => history || !a.ended_at).map(a => <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3" key={a.id}>
                <div><p className="font-semibold">{positions.find(p => p.id === a.position_id)?.name} · {a.organization_level} · {a.unit_name}</p><p>{memberLabel(a.profile_id)}</p><p className="text-xs text-slate-500">{new Date(a.started_at).toLocaleDateString()} — {a.ended_at ? new Date(a.ended_at).toLocaleDateString() : 'Current'}</p></div>
                {!a.ended_at && <button disabled={busy} className="text-red-700 underline" onClick={() => run(() => endPartyAppointment(a.id), 'Appointment ended. Its access has been removed.')}>End appointment</button>}
            </div>)}{!appointments.some(a => history || !a.ended_at) && <p className="text-slate-500">No appointments yet.</p>}</div>
        </section>
        <section className="rounded-xl border bg-white p-5 space-y-4">
            <h2 className="text-lg font-semibold">Position permissions</h2>
            <p className="text-sm text-slate-600">Editing a position updates access for all current holders. System roles and technical settings remain owner-controlled.</p>
            <div className="flex flex-wrap gap-2">{positions.map(p => <button className="rounded border px-3 py-2 text-sm" key={p.id} onClick={() => { setEditing(p.id); setName(p.name); setPermissions(p.permissions); }}>{p.name}</button>)}<button className="rounded border px-3 py-2 text-sm" onClick={() => { setEditing(null); setName(''); setPermissions([]); }}>+ New position</button></div>
            <form className="space-y-3" onSubmit={e => { e.preventDefault(); run(() => savePartyPosition(editing, name, permissions), 'Position permissions saved.'); }}>
                <label className="block">Position name<input className={field} required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>
                {PARTY_PERMISSIONS.map(p => <label className="flex items-center gap-2" key={p.key}><input type="checkbox" checked={permissions.includes(p.key)} onChange={e => setPermissions(e.target.checked ? [...permissions, p.key] : permissions.filter(k => k !== p.key))} />{p.label}</label>)}
                <button disabled={busy} className="rounded-lg bg-slate-800 px-4 py-2 text-white disabled:opacity-50">{editing ? 'Save position permissions' : 'Create position'}</button>
            </form>
        </section>
        <p className="text-sm text-slate-600">Finance and expense entry are not enabled yet. Treasurer appointments currently provide chat access only; financial viewing, entry and approval permissions will be added with the accounting module.</p>
    </div>;
}
