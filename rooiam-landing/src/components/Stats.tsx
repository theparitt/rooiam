const stats = [
    { value: 'AGPL', label: 'License', sub: 'GNU Affero GPL v3' },
    { value: 'Rust', label: 'Backend', sub: 'Actix + SQLx + Postgres' },
    { value: 'OIDC', label: 'Client Flow', sub: 'Auth code + token exchange' },
    { value: 'Cookie', label: 'Sessions', sub: 'Opaque and revocable' },
]

export default function Stats()
{
    return (
        <section className="px-6 md:px-12 lg:px-20 py-10">
            <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
                {stats.map((s) => (
                    <div key={s.label}
                        className="rounded-3xl px-6 py-5 text-center border"
                        style={{ background: 'rgba(255,255,255,0.7)', borderColor: '#FFE8F0' }}>
                        <div className="text-3xl font-black text-gray-800 mb-0.5">{s.value}</div>
                        <div className="text-sm font-black text-gray-700">{s.label}</div>
                        <div className="text-xs font-semibold text-gray-400 mt-0.5">{s.sub}</div>
                    </div>
                ))}
            </div>
        </section>
    )
}
