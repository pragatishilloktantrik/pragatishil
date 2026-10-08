import Image from 'next/image';

export default function PartyFlag({ className = '', priority = false }: { className?: string; priority?: boolean }) {
    return <Image src="/brand/flag-sapling.png" alt="प्रगतिशील लोकतान्त्रिक पार्टीको बिरुवा अङ्कित झण्डा / Pragatishil sapling flag" width={900} height={900} priority={priority} className={`object-contain ${className}`} />;
}
