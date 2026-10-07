export type PartyPermission = 'news.publish' | 'media.publish' | 'chat.use' | 'articles.review';
export const PARTY_PERMISSIONS: { key: PartyPermission; label: string }[] = [
    { key: 'news.publish', label: 'Publish news and official posts' },
    { key: 'media.publish', label: 'Publish photos and videos' },
    { key: 'articles.review', label: 'Review and publish member articles' },
    { key: 'chat.use', label: 'Start private conversations' },
];

/** Central route policy used by middleware and the dashboard navigation. */
export function canAccessAdminPath(path: string, role: string, permissions: PartyPermission[]): boolean {
    if (role === 'admin') return true;
    if (path === '/admin/reviews' || path.startsWith('/admin/reviews/')) return permissions.includes('articles.review');
    // Existing technical / party administrators retain their existing CMS access.
    if (['yantrik', 'admin_party'].includes(role)) {
        return !['/admin/registrations', '/admin/positions', '/admin/roles', '/admin/users', '/admin/council', '/admin/audit'].some(p => path === p || path.startsWith(p + '/'));
    }
    if (path === '/admin') return permissions.some(p => p === 'news.publish' || p === 'media.publish' || p === 'articles.review');
    if (path === '/admin/news' || path.startsWith('/admin/news/')) return permissions.includes('news.publish');
    if (path === '/admin/media' || path.startsWith('/admin/media/')) return permissions.includes('media.publish');
    return false;
}
