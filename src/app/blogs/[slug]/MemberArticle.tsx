import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
export default function MemberArticle({ article, own, review }: { article: { id: number; slug: string; title: string; body_en: string | null; body_ne: string | null; author_name: string | null; status: string; review_note?: string | null }; own: boolean; review: boolean }) {
    return <main className="mx-auto min-h-screen max-w-3xl space-y-6 px-4 py-12"><Link href="/blogs" className="text-blue-700 underline">← Articles / लेखहरू</Link>
        {article.status !== 'published' && <div className="rounded-lg bg-amber-50 p-4"><p>Private preview / निजी पूर्वावलोकन · {article.status === 'submitted' ? 'Awaiting review' : article.status}</p>{review && <Link href="/admin/reviews" className="mt-2 inline-block text-blue-700 underline">Open article review queue</Link>}</div>}
        <h1 className="text-3xl font-bold">{article.title}</h1><p className="text-slate-600">{article.author_name || 'Member contribution'}</p>
        <div className="prose prose-slate max-w-none whitespace-pre-wrap break-words"><ReactMarkdown>{article.body_en || article.body_ne || ''}</ReactMarkdown></div>
        {own && article.review_note && <p className="rounded-lg bg-amber-50 p-4">Editor feedback: {article.review_note}</p>}
        {own && <Link href={`/blogs/write?edit=${article.id}`} className="inline-block rounded-lg border px-4 py-3">My article / मेरो लेख</Link>}
    </main>;
}
