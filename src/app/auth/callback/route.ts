import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/serverAdmin'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    // if "next" is in param, use it as the redirect URL
    const requestedNext = searchParams.get('next') ?? searchParams.get('redirect') ?? '/'
    let next = '/'
    try {
        const destination = new URL(requestedNext, origin)
        if (destination.origin === origin) {
            next = `${destination.pathname}${destination.search}${destination.hash}`
        }
    } catch {
        // Invalid return URLs fall back to the home page.
    }

    if (code) {
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error) {
            // Get the user data from the session we just established
            const { data: { user } = {} } = await supabase.auth.getUser();

            if (user) {
                try {
                    const meta = user.user_metadata;
                    const fullName = meta.full_name || meta.name || 'Anonymous';
                    const avatarUrl = meta.avatar_url || meta.picture || null;

                    // Check if profile already exists
                    const { data: existingProfile } = await supabaseAdmin
                        .from('profiles')
                        .select('id, role')
                        .eq('id', user.id)
                        .single();

                    if (existingProfile) {
                        // User exists - only update name/avatar, PRESERVE role
                        const { error: updateError } = await supabaseAdmin
                            .from('profiles')
                            .update({
                                full_name: fullName,
                                avatar_url: avatarUrl,
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', user.id);

                        if (updateError) {
                            console.error('[Auth Callback] Profile update error:', updateError);
                        } else {
                        }
                    } else {
                        // New user - create with default 'member' role
                        const { error: insertError } = await supabaseAdmin
                            .from('profiles')
                            .insert({
                                id: user.id,
                                full_name: fullName,
                                avatar_url: avatarUrl,
                                role: 'member',
                                updated_at: new Date().toISOString()
                            });

                        if (insertError) {
                            console.error('[Auth Callback] Profile insert error:', insertError);
                        } else {
                        }
                    }
                } catch (err) {
                    console.error('[Auth Callback] Unexpected error syncing profile:', err);
                }
            }

            return NextResponse.redirect(`${origin}${next}`)
        }
    }

    // Return to the login screen so a failed sign-in can be retried.
    return NextResponse.redirect(`${origin}/auth/login?error=auth_callback`)
}
