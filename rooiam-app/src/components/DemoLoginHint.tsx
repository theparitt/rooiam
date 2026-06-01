type DemoAccountHint = {
    label: string
    email: string
    onFillEmail: () => void
}

type DemoLoginHintProps = {
    title: string
    accounts: DemoAccountHint[]
    accentColor: string
    showPasskey: boolean
    mailboxUrl?: string | null
}

// Keep demo login hint layout aligned with docs/internal/11_demo_login_hint_rules.md.
export default function DemoLoginHint({ title, accounts, accentColor, showPasskey, mailboxUrl }: DemoLoginHintProps) {
    const primaryAccount = accounts[0]
    return (
        <div
            className="mt-4 rounded-2xl border px-4 py-3 text-left text-xs"
            style={{ borderColor: `${accentColor}30`, background: `${accentColor}08` }}
        >
            <p className="mb-1 font-black" style={{ color: accentColor }}>{title}</p>
            {accounts.length > 0 ? (
                <div className="mb-3 space-y-1 font-medium text-gray-500">
                    {accounts.map(account => (
                        <div key={account.email} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-black text-gray-700">{account.label}:</span>
                            <button
                                type="button"
                                onClick={account.onFillEmail}
                                className="font-black underline text-gray-700"
                            >
                                {account.email}
                            </button>
                        </div>
                    ))}
                </div>
            ) : null}
            <div className="space-y-3 font-medium text-gray-500">
                <div>
                    <p className="font-black text-gray-700">Magic Link</p>
                    <ol className="space-y-0.5">
                        <li>1. Choose a demo role above</li>
                        <li>2. Click <strong className="text-gray-700">Send Magic Link</strong></li>
                        <li>3. Open {mailboxUrl ? <a href={mailboxUrl} target="_blank" rel="noopener noreferrer" className="font-black underline" style={{ color: accentColor }}>MailHog inbox →</a> : <span className="text-gray-400">MailHog inbox</span>}</li>
                        <li>4. Click the login link in the email</li>
                    </ol>
                </div>
                {showPasskey ? (
                    <div>
                        <p className="font-black text-gray-700">Passkey</p>
                        <ol className="space-y-0.5">
                            <li>1. Choose a demo role above</li>
                            <li>2. Click <strong className="text-gray-700">Passkey</strong></li>
                        </ol>
                    </div>
                ) : null}
            </div>
        </div>
    )
}
