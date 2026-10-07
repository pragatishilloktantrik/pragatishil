import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Metadata } from 'next';
export const metadata: Metadata = { title: 'Member articles | प्रगतिशील विचार', description: 'Articles and ideas from Pragatishil members.' };
export default async function ArticlesPage({ searchParams }: { searchParams: { page?: string } }) {
    const db = await createClient();
    const page = Math.max(1, Math.min(10000, Number.parseInt(searchParams.page || '1', 10) || 1));
    const { data, error, count } = await db.from('news_items').select('id,slug,title,summary_en,summary_ne,author_name,published_at', { count: 'exact' }).eq('content_type', 'article').eq('status', 'published').order('published_at', { ascending: false }).range((page-1)*24,page*24-1);
    return <main className="min-h-screen bg-slate-50 px-4 py-12"><div className="mx-auto max-w-5xl space-y-8"><header className="space-y-4"><h1 className="text-3xl font-bold">प्रगतिशील विचार / Member articles</h1><p>विचार र लेखहरू साझा गर्नुहोस्। Members can submit articles for review before publication.</p><Link className="inline-block rounded-lg bg-blue-700 px-5 py-3 text-white" href="/blogs/write">लेख पठाउनुहोस् / Submit an article · My drafts</Link></header>
        {error ? <p role="alert">Unable to load articles. Please try again.</p> : <><div className="grid gap-5 md:grid-cols-2">{data?.map(a => <article key={a.id} className="space-y-3 rounded-xl border bg-white p-6"><Link href={`/blogs/${a.slug || a.id}`} className="text-xl font-semibold text-blue-800 hover:underline">{a.title}</Link><p className="text-sm text-slate-500">{a.author_name || 'Member'}{a.published_at ? ` · ${new Date(a.published_at).toLocaleDateString()}` : ''}</p><p className="text-slate-700">{a.summary_en || a.summary_ne}</p><Link href={`/blogs/${a.slug || a.id}`} className="text-blue-700 underline">पूरा लेख पढ्नुहोस् / Read article</Link></article>)}</div>{!data?.length && <p>No published articles yet. You can submit the first article for review.</p>}<nav className="flex gap-5">{page > 1 && <Link href={`/blogs?page=${page-1}`}>← Previous</Link>}{page*24 < (count || 0) && <Link href={`/blogs?page=${page+1}`}>Next →</Link>}</nav></>}
    </div></main>;
}
