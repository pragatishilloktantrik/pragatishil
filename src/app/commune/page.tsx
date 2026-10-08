"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import SaplingLoadingAnimation from "@/components/SaplingLoadingAnimation";

// Dynamically import ChannelListingPage
const ChannelListingPage = dynamic(() => import("./ChannelListingPage"), {
    ssr: false,
    loading: () => (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-black flex flex-col items-center justify-center">
            <SaplingLoadingAnimation />
        </div>
    ),
});

function LegacyChannelRedirect() {
    const query = useSearchParams();
    const router = useRouter();
    const channel = query.get('channel');
    useEffect(() => { if (channel) router.replace(`/commune/${encodeURIComponent(channel)}`); }, [channel, router]);
    return null;
}
export default function CommunePage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-black flex flex-col items-center justify-center">
                    <SaplingLoadingAnimation />
                </div>
            }
        >
            <LegacyChannelRedirect />
            <ChannelListingPage />
        </Suspense>
    );
}
