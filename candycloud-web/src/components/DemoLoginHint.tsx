type DemoLoginHintProps = {
  title: string
  email: string
  accentColor: string
  onFillEmail: () => void
  showPasskey: boolean
  showMfaStep: boolean
  showSetupHint: boolean
  mailboxUrl?: string | null
}

// Keep demo login hint layout aligned with docs/internal/11_demo_login_hint_rules.md.
export default function DemoLoginHint({
  title,
  email,
  accentColor,
  onFillEmail,
  showPasskey,
  showMfaStep,
  showSetupHint,
  mailboxUrl,
}: DemoLoginHintProps) {
  return (
    <div className="demo-try-hint" style={{ borderColor: `${accentColor}40`, background: `${accentColor}08` }}>
      <p className="demo-try-hint-title" style={{ color: accentColor }}>{title}</p>
      {showSetupHint ? (
        <p style={{ margin: '0 0 0.9rem', color: '#5d4d68', lineHeight: 1.55 }}>
          Passkey and MFA work after this user signs in once and finishes setup in the dashboard
          <strong> Passkeys &amp; MFA </strong>
          section. Start with Magic Link if the account has not been enrolled yet.
        </p>
      ) : null}
      <div style={{ display: 'grid', gap: '0.8rem' }}>
        <div>
          <p style={{ fontWeight: 900, margin: '0 0 0.25rem', color: '#31263b' }}>Magic Link</p>
          <ol className="demo-try-hint-steps">
            <li>1. Click <button type="button" onClick={onFillEmail} style={{ fontWeight: 900, textDecoration: 'underline', color: '#31263b' }}>{email}</button></li>
            <li>2. Click <strong>Send Magic Link</strong></li>
            <li>3. Open {mailboxUrl ? <a href={mailboxUrl} target="_blank" rel="noopener noreferrer" style={{ color: accentColor }}>MailHog inbox →</a> : <span>MailHog inbox</span>}</li>
            <li>4. Click the <strong>Authenticate</strong> button in the email</li>
            {showMfaStep ? <li>5. Finish the MFA step</li> : null}
          </ol>
        </div>
        {showPasskey ? (
          <div>
            <p style={{ fontWeight: 900, margin: '0 0 0.25rem', color: '#31263b' }}>Passkey</p>
            <ol className="demo-try-hint-steps">
              <li>1. Click <button type="button" onClick={onFillEmail} style={{ fontWeight: 900, textDecoration: 'underline', color: '#31263b' }}>{email}</button></li>
              <li>2. Click <strong>Passkey</strong></li>
              {showMfaStep ? <li>3. Finish the MFA step</li> : null}
            </ol>
          </div>
        ) : null}
      </div>
    </div>
  )
}
