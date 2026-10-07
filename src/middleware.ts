import { aiDisabledResponse } from '@/lib/ai/enabled'
import { canAccessAdminPath, PartyPermission } from '@/lib/party-access'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
    if (request.nextUrl.pathname.startsWith('/api/ai/')) {
        const disabled = aiDisabledResponse();
        if (disabled) return disabled;
    }
    let response = NextResponse.next({ request })
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
        {
            cookies: {
                getAll() { return request.cookies.getAll() },
                setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    response = NextResponse.next({ request })
                    cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
                },
            },
        }
    )

    // Validate the user while refreshing cookies; do not trust client-supplied session data.
    const { data: { user: verifiedUser }, error } = await supabase.auth.getUser()
    const redirectWithSession = (path: string) => {
        const redirect = NextResponse.redirect(new URL(path, request.url))
        response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie))
        return redirect
    }

    // Protected Route Logic
    if (request.nextUrl.pathname.startsWith('/admin')) {
        // For Admin routes, we MUST verify with getUser() to ensure the user isn't banned/deleted

        if (!verifiedUser || error) {
            return redirectWithSession('/join')
        }

        // Check ADMIN role
        const { data: profile } = await supabase
            .from('profiles')
            .select('role,is_banned')
            .eq('id', verifiedUser.id)
            .single()


        // CMS restricted to yantrik, admin_party, admin only
        const permissions: PartyPermission[] = [];
        for (const key of ['news.publish', 'media.publish', 'articles.review'] as PartyPermission[]) {
            const { data: allowed } = await supabase.rpc('has_party_permission', { permission_key: key });
            if (allowed) permissions.push(key);
        }
        if (!profile || profile.is_banned || !canAccessAdminPath(request.nextUrl.pathname, profile.role, permissions)) {
            return redirectWithSession('/')
        }
    }

    return response
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * Feel free to modify this pattern to include more paths.
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
