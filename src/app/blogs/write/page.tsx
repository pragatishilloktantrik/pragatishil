'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getArticleWorkspace, saveMemberArticle } from '@/actions/member-articles';

type Workspace = Awaited<ReturnType<typeof getArticleWorkspace>>;
const statusLabels: Record<string, string> = { draft: 'Draft / मस्यौदा', submitted: 'Awaiting review / समीक्षाको प्रतीक्षामा', rejected: 'Changes requested / सुधार आवश्यक', published: 'Published / प्रकाशित', archived: 'Archived / संग्रहित' };
export default function WriteArticle() {
    const params = useSearchParams();
    const [workspace, setWorkspace] = useState<Workspace | null>(null);
    const [id, setId] = useState<number | null>(null);
    const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [summary, setSummary] = useState('');
    const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
    const [dirty, setDirty] = useState(false);
    const edit = params.get('edit');
    useEffect(() => { getArticleWorkspace().then(w => {
        setWorkspace(w);
        const article = w.articles.find(a => String(a.id) === edit);
        if (article) { setId(article.id); setTitle(article.title); setBody(article.body_en || ''); setSummary(article.summary_en || ''); }
    }).catch(e => setError(e.message)); }, [edit]);
    useEffect(() => {
        const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
        window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);
    const current = workspace?.articles.find(a => a.id === id);
    const locked = !!current && !['draft', 'rejected'].includes(current.status);
    async function save(submit: boolean) {
        setBusy(true); setError(''); setMessage('');
        try {
            const result = await saveMemberArticle({ id, title, body, summary, submit });
            setId(result.id); setDirty(false); setWorkspace(await getArticleWorkspace());
            setMessage(submit ? 'लेख समीक्षाका लागि पठाइयो। Admin/editor notified; your article will appear publicly after approval.' : 'मस्यौदा सुरक्षित भयो / Draft saved.');
        } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save. Please try again.'); }
        finally { setBusy(false); }
    }
    return <main className="min-h-screen bg-slate-50 px-4 py-12"><div className="mx-auto max-w-3xl space-y-6">
        <Link href="/blogs" className="text-blue-700 underline">← Articles / लेखहरू</Link>
        <h1 className="text-3xl font-bold">लेख पठाउनुहोस् / Submit an article</h1>
        <p className="text-slate-600">नेपाली वा अंग्रेजीमा लेख्नुहोस्। Save a draft, then submit for admin/editor review. Submitted articles are private until approved for the public website.</p>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}
        {message && <p role="status" className="rounded-lg bg-green-50 p-4 text-green-800">{message}</p>}
        {!workspace && !error && <p>Loading…</p>}
        {workspace && !workspace.signedIn && <Link className="inline-block rounded-lg bg-blue-700 p-4 text-white" href="/auth/login?redirect=/blogs/write">Sign in / लगइन गर्नुहोस्</Link>}
        {workspace?.signedIn && !workspace.eligible && <p>पहिले सदस्यता फारम भर्नुहोस्। <Link href="/join" className="text-blue-700 underline">Complete your membership registration</Link> to submit articles.</p>}
        {workspace?.eligible && <form onSubmit={e => { e.preventDefault(); save(true); }} className="space-y-5 rounded-xl border bg-white p-5">
            {current?.review_note && <p className="rounded-lg bg-amber-50 p-4">Editor feedback / सम्पादकको सुझाव: {current.review_note}</p>}
            {current && <p className="font-semibold">{statusLabels[current.status] || current.status}</p>}
            <label className="block font-medium">शीर्षक / Title *<input required maxLength={200} disabled={locked || busy} value={title} onChange={e => { setTitle(e.target.value); setDirty(true); }} className="mt-2 w-full rounded-lg border p-3" /></label>
            <label className="block font-medium">छोटो परिचय / Summary (optional)<textarea maxLength={1000} disabled={locked || busy} value={summary} onChange={e => { setSummary(e.target.value); setDirty(true); }} rows={2} className="mt-2 w-full rounded-lg border p-3" /></label>
            <label className="block font-medium">लेख / Article *<textarea maxLength={50000} disabled={locked || busy} value={body} onChange={e => { setBody(e.target.value); setDirty(true); }} rows={16} className="mt-2 w-full rounded-lg border p-3 font-normal" /></label>
            {!locked ? <div className="flex flex-wrap gap-3"><button type="button" disabled={busy || !title.trim()} onClick={() => save(false)} className="rounded-lg border px-5 py-3 disabled:opacity-50">Save draft / मस्यौदा सुरक्षित गर्नुहोस्</button><button disabled={busy || !title.trim() || body.trim().length < 20} className="rounded-lg bg-blue-700 px-5 py-3 text-white disabled:opacity-50">{busy ? 'Saving…' : 'Submit for review / समीक्षाका लागि पठाउनुहोस्'}</button></div> : <p>Review is pending or complete. Articles returned for changes can be edited and resubmitted.</p>}
        </form>}
        {!!workspace?.articles.length && <section className="space-y-3"><h2 className="text-xl font-bold">My articles / मेरा लेखहरू</h2><a href="/blogs/write" className="inline-block rounded-lg bg-blue-50 px-4 py-3 text-blue-800">+ New article / नयाँ लेख</a>{workspace.articles.map(a => <div key={a.id} className="rounded-lg border bg-white p-4"><Link href={a.status === 'published' ? `/blogs/${a.slug}` : `/blogs/write?edit=${a.id}`} className="font-semibold text-blue-800 underline">{a.title}</Link><p className="mt-1 text-sm text-slate-600">{statusLabels[a.status] || a.status}</p></div>)}</section>}
    </div></main>;
}
