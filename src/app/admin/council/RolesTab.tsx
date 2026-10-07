import Link from 'next/link';
export default function RolesTab() {
    return <section className="rounded-xl border bg-white p-6 space-y-4">
        <h2 className="text-xl font-semibold">Positions & access</h2>
        <p>Appoint Sachiv ji and other office bearers by committee and area. Publishing and chat permissions follow the current appointment.</p>
        <Link className="inline-block rounded-lg bg-blue-700 px-4 py-2 text-white" href="/admin/positions">Manage appointments</Link>
        <p className="text-sm text-slate-600">System roles are managed separately in User Management. Private channel membership is managed in User Access.</p>
    </section>;
}
