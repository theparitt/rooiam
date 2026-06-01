type DemoLoginHintProps = {
    title: string
    email: string
    accentColor: string
    onFillEmail: () => void
    mailboxUrl?: string | null
}

// Keep demo login hint layout aligned with docs/internal/11_demo_login_hint_rules.md.
export default function DemoLoginHint({ title, email, accentColor, onFillEmail, mailboxUrl }: DemoLoginHintProps) {
    return (
        <div
            className="mt-4 rounded-2xl border px-4 py-3 text-left text-xs"
            style={{
                borderColor: 'rgba(236, 72, 153, 0.18)',
                background: 'rgba(236, 72, 153, 0.06)',
            }}
        >
            <p className="mb-1 font-black" style={{ color: accentColor }}>
                {title}
            </p>
            <div className="space-y-3 font-medium leading-5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                <div>
                    <p className="font-black" style={{ color: 'hsl(var(--foreground))' }}>Magic Link</p>
                    <ol className="space-y-0.5">
                        <li>
                            1. Click{' '}
                            <button
                                type="button"
                                onClick={onFillEmail}
                                className="font-black underline"
                                style={{ color: 'hsl(var(--foreground))' }}
                            >
                                {email}
                            </button>
                        </li>
                        <li>2. Click <strong style={{ color: 'hsl(var(--foreground))' }}>Send Magic Link</strong></li>
                        <li>3. Open {mailboxUrl ? <a href={mailboxUrl} target="_blank" rel="noopener noreferrer" className="font-black underline" style={{ color: accentColor }}>MailHog inbox</a> : <span>MailHog inbox</span>}</li>
                        <li>4. Click the login link in the email</li>
                    </ol>
                </div>
                <div>
                    <p className="font-black" style={{ color: 'hsl(var(--foreground))' }}>Passkey</p>
                    <ol className="space-y-0.5">
                        <li>
                            1. Click{' '}
                            <button
                                type="button"
                                onClick={onFillEmail}
                                className="font-black underline"
                                style={{ color: 'hsl(var(--foreground))' }}
                            >
                                {email}
                            </button>
                        </li>
                        <li>2. Click <strong style={{ color: 'hsl(var(--foreground))' }}>Passkey</strong></li>
                    </ol>
                </div>
            </div>
        </div>
    )
}
