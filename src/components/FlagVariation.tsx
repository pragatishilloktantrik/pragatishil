import PartyFlag from './PartyFlag';

// All organizational units use the same party flag.
export default function FlagVariation({ className = '' }: { channelId: string; className?: string }) {
    return <div className={`flex items-center justify-center bg-white ${className}`}><PartyFlag className="h-full w-full" /></div>;
}
