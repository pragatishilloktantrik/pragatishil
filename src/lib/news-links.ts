/** Publisher links take precedence; database IDs do not identify external coverage. */
export function getNewsLink(item: { id: number | string; slug?: string | null; link?: string | null; content_type?: string | null }) {
    if (item.link) {
        try {
            const url = new URL(item.link);
            if (url.protocol === 'https:' || url.protocol === 'http:') {
                return { href: url.href, external: true };
            }
        } catch { /* Missing or invalid publisher URL: use the article page. */ }
    }
    return { href: `/${item.content_type === 'article' ? 'blogs' : 'news'}/${item.slug || item.id}`, external: false };
}
