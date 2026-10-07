import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Roles that can use messaging
const MESSAGING_ROLES = ['party_member', 'team_member', 'central_committee', 'board', 'admin_party', 'admin', 'yantrik'];

async function canUseMessaging(supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never, userId: string): Promise<boolean> {
    const { data: profile } = await supabase
        .from("profiles")
        .select("role,is_banned")
        .eq("id", userId)
        .single();

    const { data: appointed } = await supabase.rpc('has_party_permission', { permission_key: 'chat.use' });
    return !profile?.is_banned && (!!appointed || !!(profile?.role && MESSAGING_ROLES.includes(profile.role)));
}

/**
 * Get all conversations for current user
 * GET /api/messages/conversations
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check role permission
    if (!await canUseMessaging(supabase, user.id)) {
        return NextResponse.json({ error: "Messaging requires party_member role or higher" }, { status: 403 });
    }

    // Get conversations with latest message and other participant
    const { data: participations, error } = await supabase
        .from("conversation_participants")
        .select(`
            conversation_id,
            last_read_at,
            conversations!inner (
                id,
                updated_at
            )
        `)
        .eq("user_id", user.id)
        .order("conversations(updated_at)", { ascending: false });

    if (error) {
        console.error("Conversations fetch error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get details for each conversation
    const conversationsWithDetails = await Promise.all((participations || []).map(async (p) => {
        const conversationId = p.conversation_id;

        // Get other participant(s)
        const { data: otherParticipants } = await supabase
            .from("conversation_participants")
            .select(`
                profiles:user_id (
                    id,
                    full_name,
                    handle,
                    avatar_url
                )
            `)
            .eq("conversation_id", conversationId)
            .neq("user_id", user.id);

        // Get latest message
        const { data: latestMessage } = await supabase
            .from("direct_messages")
            .select("id, content, created_at, sender_id")
            .eq("conversation_id", conversationId)
            .eq("is_deleted", false)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

        // Get unread count
        const { count: unreadCount } = await supabase
            .from("direct_messages")
            .select("*", { count: 'exact', head: true })
            .eq("conversation_id", conversationId)
            .eq("is_deleted", false)
            .neq("sender_id", user.id)
            .gt("created_at", p.last_read_at || '1970-01-01');

        return {
            id: conversationId,
            participants: otherParticipants?.map(op => op.profiles) || [],
            lastMessage: latestMessage,
            unreadCount: unreadCount || 0,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            updatedAt: (p.conversations as any)?.updated_at || null
        };
    }));

    return NextResponse.json({ conversations: conversationsWithDetails });
}

/**
 * Start a new conversation
 * POST /api/messages/conversations
 * Body: { userId: string }  - the other participant
 */
export async function POST(request: NextRequest) {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check role permission
    if (!await canUseMessaging(supabase, user.id)) {
        return NextResponse.json({ error: "Messaging requires party_member role or higher" }, { status: 403 });
    }

    const { userId } = await request.json();

    if (!userId || userId === user.id) {
        return NextResponse.json({ error: "Valid userId required" }, { status: 400 });
    }

    const { data: conversationId, error } = await supabase.rpc('start_party_conversation', { p_recipient: userId });
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === '42501' ? 403 : 400 });
    return NextResponse.json({ conversationId });
}
