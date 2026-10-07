import { NextResponse } from 'next/server';

// Opt in explicitly only after reviewing provider costs.
export function aiDisabledResponse() {
    return process.env.WEBSITE_AI_ENABLED === 'true' ? null : NextResponse.json(
        { error: 'AI features are currently disabled. Please enter details manually.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
}
