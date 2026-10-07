'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getArticleReviewQueue, reviewMemberArticle } from '@/actions/member-articles';
export default function ArticleReviews() {
    const [queue, setQueue] = useState<Awaited<ReturnType<typeof getArticleReviewQueue>> | null>(null);
    const [offset, setOffset] = useState(0); const [error, setError] = useState('');
    const [notes, setNotes] = useState<Record<number,string>>({}); const [busy, setBusy] = useState<number | null>(null);
    const [message, setMessage] = useState(''); const [confirm, setConfirm] = useState<number | null>(null);
    useEffect(() => { setError(''); getArticleReviewQueue(offset).then(setQueue).catch(e => setError(e.message)); }, [offset]);
    async function review(id: number, decision: 'published' | 'rejected') {
        setBusy(id); setError(''); setMessage('');
        try { await reviewMemberArticle(id, decision, notes[id] || ''); setConfirm(null); setQueue(await getArticleReviewQueue(offset)); setMessage(decision === 'published' ? 'Published. The author has been notified.' : 'Returned for changes. The author has been notified.'); }
        catch (e) { setError(e instanceof Error ? e.message : 'Unable to save review.'); } finally { setBusy(null); }
    }
    return <div className="mx-auto max-w-4xl space-y-5"><h1 className="text-2xl font-bold">Article reviews / लेख समीक्षा</h1><p>Read each submission before publishing. Published articles appear on the public website. Return an article with feedback if it needs changes.</p>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}{message && <p role="status" className="rounded-lg bg-green-50 p-4">{message}</p>}
        {!queue && !error && <p>Loading submissions…</p>}
        {queue && <><p>{queue.count} awaiting review</p>{!queue.articles.length && <p>No submissions on this page.</p>}{queue.articles.map(a => <article key={a.id} className="space-y-3 rounded-xl border bg-white p-5"><h2 className="text-xl font-bold">{a.title}</h2><p className="text-sm text-slate-600">{a.author_name || 'Member'} · {new Date(a.created_at).toLocaleDateString()}</p><p>{a.summary_en}</p><Link href={`/blogs/${a.slug}`} target="_blank" rel="noopener noreferrer" className="inline-block rounded-lg bg-blue-50 px-4 py-3 text-blue-800">Read full article / पूरा लेख पढ्नुहोस् ↗</Link>
            {a.author_id === queue.userId && !queue.owner ? <p>Another editor or the owner must review your submission.</p> : <><label className="block">Feedback to author (required when requesting changes)<textarea maxLength={2000} rows={3} value={notes[a.id] || ''} onChange={e => setNotes(n => ({ ...n, [a.id]: e.target.value }))} className="mt-2 w-full rounded-lg border p-3" /></label><div className="flex flex-wrap gap-3"><button disabled={busy !== null} onClick={() => setConfirm(a.id)} className="rounded-lg bg-green-700 px-4 py-3 text-white disabled:opacity-50">Publish… / प्रकाशित गर्नुहोस्</button><button disabled={busy !== null || !notes[a.id]?.trim()} onClick={() => review(a.id, 'rejected')} className="rounded-lg border px-4 py-3 disabled:opacity-50">Request changes / सुधार माग्नुहोस्</button></div>{confirm === a.id && <div className="rounded-lg border border-green-300 p-4"><p>Publish “{a.title}” for everyone to read?</p><button disabled={busy !== null} onClick={() => review(a.id, 'published')} className="mt-3 rounded-lg bg-green-700 px-4 py-2 text-white">Confirm publication</button><button disabled={busy !== null} onClick={() => setConfirm(null)} className="ml-3 underline">Cancel</button></div>}</>}
        </article>)}<div className="flex gap-4"><button disabled={offset === 0 || busy !== null} onClick={() => setOffset(Math.max(0, offset-20))} className="rounded border px-4 py-2 disabled:opacity-50">Previous</button><button disabled={offset+20 >= queue.count || busy !== null} onClick={() => setOffset(offset+20)} className="rounded border px-4 py-2 disabled:opacity-50">Next</button></div></>}
    </div>;
}
