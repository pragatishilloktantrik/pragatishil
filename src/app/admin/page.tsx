'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAdminDashboard } from '@/actions/admin-dashboard';

export default function AdminDashboard() {
    const [data, setData] = useState<Awaited<ReturnType<typeof getAdminDashboard>> | null>(null);
    const [error, setError] = useState('');
    useEffect(() => { getAdminDashboard().then(setData).catch(e => setError(e.message)); }, []);
    if (error) return <p role="alert" className="text-red-700">{error}</p>;
    if (!data) return <p>Loading dashboard…</p>;
    const cards = [
        { label: 'News items visible to you', count: data.news, href: '/admin/news' },
        { label: 'Media items', count: data.media, href: '/admin/media' },
        { label: 'Membership applications', count: data.members, href: '/admin/users' },
    ].filter(c => c.count !== null);
    return <div className="max-w-5xl space-y-8">
        <div><h1 className="text-2xl font-bold">Dashboard</h1><p className="mt-2 text-slate-600">Live counts from the website database.</p></div>
        <div className="grid gap-4 md:grid-cols-3">{cards.map(c => <Link key={c.href} href={c.href} className="rounded-xl border bg-white p-6 hover:border-blue-400"><p className="text-3xl font-bold">{c.count}</p><p className="mt-2 text-slate-600">{c.label}</p></Link>)}</div>
        <section className="rounded-xl border bg-white p-6 space-y-4"><h2 className="text-lg font-semibold">Your workspace</h2><div className="flex flex-wrap gap-3">
            {data.news !== null && <Link className="rounded-lg bg-blue-50 px-4 py-3 text-blue-800" href="/admin/news">News & official posts</Link>}
            {data.media !== null && <Link className="rounded-lg bg-purple-50 px-4 py-3 text-purple-800" href="/admin/media">Photos & videos</Link>}
            <Link className="rounded-lg bg-slate-100 px-4 py-3" href="/messages">Messages</Link>
            <Link className="rounded-lg bg-slate-100 px-4 py-3" href="/commune">Community channels</Link>
            {data.owner && <><Link className="rounded-lg bg-amber-50 px-4 py-3 text-amber-900" href="/admin/positions">Positions & access</Link><Link className="rounded-lg bg-slate-100 px-4 py-3" href="/admin/users">Members & system roles</Link></>}
        </div></section>
        {data.owner && <p className="text-sm text-slate-600">Use Positions & access to appoint Sachiv ji and other office bearers. Financial records and expense entry will be added in a separate accounting module.</p>}
    </div>;
}
