import Image from 'next/image';

export default function SaplingLoadingAnimation() {
    return <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 p-6">
        <div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-emerald-100">
            <span aria-hidden="true" className="sapling-loader-ring absolute inset-0 rounded-full border-2 border-transparent border-t-brand-blue border-r-emerald-600" />
            <Image src="/brand/sapling.png" alt="" width={96} height={96} className="sapling-loader-mark h-24 w-24 object-contain" />
        </div>
        <p className="text-sm font-medium text-slate-600">लोड हुँदैछ / Loading…</p>
    </div>;
}
