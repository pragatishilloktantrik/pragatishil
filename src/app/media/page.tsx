import MediaContent from "./MediaContent";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
    title: "Media & Press | Pragatishil Loktantrik Party",
    description: "Media coverage, articles, interviews and photographs.",
};

export const dynamic = 'force-dynamic';

export default async function MediaPage() {
    const supabase = await createClient();

    // Fetch Published News
    const { data: news } = await supabase
        .from('news_items')
        .select('*')
        .eq('status', 'published')
        .eq('content_type', 'official')
        .order('date', { ascending: false });

    // Fetch Gallery Items
    const { data: media } = await supabase
        .from('media_gallery')
        .select('*')
        .order('created_at', { ascending: false });

    return (
        <main className="min-h-screen bg-slate-50/50 py-12 md:py-20">
            <MediaContent
                initialNews={news || []}
                initialMedia={media || []}
            />
        </main>
    );
}
