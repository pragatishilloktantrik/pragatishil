export const dynamic = 'force-dynamic'; // Always fresh data

import { supabaseAdmin } from "@/lib/supabase/serverAdmin";
import { createClient } from "@/lib/supabase/server";
import MembersClient from "./MembersClient";
import { Profile, UserRole, hasRole } from "@/types";
import { Suspense } from "react";
import { MembersLoading } from "./MembersClient";

export default async function MembersGalleryPage() {
    // Get viewer's role to determine visibility
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let viewerRole: UserRole = 'guest';
    if (user) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();
        if (profile) viewerRole = profile.role as UserRole;
    }

    // Central committee and above can see ALL members
    const canSeeAllMembers = hasRole(viewerRole, 'central_committee');

    let query = supabaseAdmin.from("profiles").select("id,full_name,avatar_url,role,is_public,bio,location,expertise,skills,profession,profession_category,organization,position_title,handle,show_location,show_contact_email,show_contact_phone,contact_email_public,contact_phone_public,province_id,district_id,local_level_id,member_since");

    if (canSeeAllMembers) {
        // Fetch all members for central committee+
        // Still exclude admin and yantrik from display
        query = query.not('role', 'in', '(admin,yantrik)');
    } else {
        // Regular users only see public + leadership
        query = query.eq("is_public", true);
    }

    const { data: members, error } = await query;

    if (error) {
        console.error("Error fetching members:", error);
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center p-10">
                    <h1 className="text-2xl font-bold text-red-500 mb-2">Failed to load members</h1>
                    <p className="text-slate-500">{error.message}</p>
                </div>
            </div>
        );
    }

    // Ensure defaults for any missing fields
    const safeMembers = (members || []).map(m => ({
        ...m,
        location: m.show_location ? m.location : null,
        province_id: m.show_location ? m.province_id : null,
        district_id: m.show_location ? m.district_id : null,
        local_level_id: m.show_location ? m.local_level_id : null,
        contact_email_public: m.show_contact_email ? m.contact_email_public : null,
        contact_phone_public: m.show_contact_phone ? m.contact_phone_public : null,
        role: m.role || 'supporter',
        is_public: m.is_public ?? false,
        expertise: m.expertise || [],
        skills: m.skills || [],
    })) as Profile[];

    return (
        <Suspense fallback={<MembersLoading />}>
            <MembersClient
                members={safeMembers}
                viewerRole={viewerRole}
            />
        </Suspense>
    );
}
