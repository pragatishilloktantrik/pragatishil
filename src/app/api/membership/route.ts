import { NextRequest, NextResponse } from 'next/server';
import { createMembershipApplication } from '@/services/membership';
import { MembershipRequestPayload } from '@/types';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Please sign in before submitting your application.' }, { status: 401 });
        }
        const body = await req.json();

        // Basic structural check (TS doesn't validate runtime, but we assume body is JSON)
        const payload = body as MembershipRequestPayload;

        if (!payload?.personal || !payload.contact || !payload.party || !payload.documents) {
            return NextResponse.json({ error: 'Missing required application sections.' }, { status: 400 });
        }

        // Bind membership to the verified session, never a browser-supplied user ID.
        payload.meta = { ...payload.meta, authUserId: user.id };

        const { memberId } = await createMembershipApplication(payload);

        return NextResponse.json({ id: memberId }, { status: 201 });
    } catch (error) {
        console.error("API /membership error:", error);

        // Distinguish validation vs internal errors
        const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
        const status = errorMessage.includes("required") ? 400 : 500;

        return NextResponse.json(
            { error: errorMessage },
            { status: status }
        );
    }
}
