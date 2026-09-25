import { DOCS_BASE_URL, GITHUB_REPO_URL } from '../lib/site'

// Keep each result tied to its tested environment and actual run time. When
// updating test evidence, set lastTestedAt to the run's ISO 8601 timestamp
// (with a UTC offset); never use the page build, edit, or deploy time. Older
// evidence recorded only a date, so keep that date without inventing a clock
// time. A source build, assisted phone run, or local suite is not certification.
export type Result = 'passed' | 'not-passed' | 'blocked' | 'no-verdict' | 'review' | 'skipped' | 'not-tested'

export type TestingRow = {
    topic: string
    result: Result
    description: string
    evidence: string
    evidenceHref?: string
}

export type TestingCategory = {
    id: 'openid' | 'android' | 'sdk' | 'operations'
    group: 'standards' | 'platforms' | 'operations'
    label: string
    shortLabel: string
    summary: string
    scope: string
    lastTestedOn: string // YYYY-MM-DD in the evidence record's calendar date
    lastTestedAt?: string // actual test completion time, ISO 8601 with offset
    rows: TestingRow[]
    note: string
    links: { label: string; href: string }[]
}

export const testingCategoryGroups = [
    { id: 'standards', label: 'Standards & conformance' },
    { id: 'platforms', label: 'Apps & developer tools' },
    { id: 'operations', label: 'Reliability & operations' },
] as const

export const testingCategories: TestingCategory[] = [
    {
        id: 'openid',
        group: 'standards',
        label: 'OpenID',
        shortLabel: 'Partial coverage',
        summary: 'Config OP passed; Basic OP did not. No certification.',
        scope: 'Official Conformance Suite 5.3.1 on isolated candidates; a later production discovery inspection is listed separately below.',
        lastTestedOn: '2026-09-25',
        lastTestedAt: '2026-09-25T05:06:06Z',
        rows: [
            { topic: 'Config OP · discovery & JWKS', result: 'passed', description: 'All 35 metadata and signing-key checks passed.', evidence: '24 Sep · Suite 5.3.1 · source 81068f4', evidenceHref: `${GITHUB_REPO_URL}/commit/81068f4` },
            { topic: 'Basic OP · complete profile*', result: 'not-passed', description: '17 failed, 3 review, 3 skipped, 12 no verdict; none passed.', evidence: '25 Sep · Suite 5.3.1 · strict PKCE · source 860fcb0', evidenceHref: `${GITHUB_REPO_URL}/commit/860fcb0` },
            { topic: 'Basic browser sign-in', result: 'not-passed', description: 'A direct request cannot continue through hosted login. Strict mode also rejects an omitted S256 challenge.', evidence: '25 Sep · isolated candidate' },
            { topic: 'Token, UserInfo & refresh', result: 'blocked', description: 'Many Basic OP modules stopped at authorization before their intended downstream check.', evidence: '25 Sep · Basic OP run' },
            { topic: 'POST authorization', result: 'no-verdict', description: 'The suite did not finish this module; a direct POST to /v1/oidc/authorize returned 404.', evidence: '25 Sep · isolated candidate' },
            { topic: 'Error & redirect handling', result: 'review', description: 'Three screenshot-based modules await human review; this is not a pass.', evidence: '25 Sep · Basic OP run' },
            { topic: 'Optional address/phone scopes', result: 'skipped', description: 'Three modules were skipped because these optional scopes were not advertised.', evidence: '25 Sep · Basic OP run' },
            { topic: 'Basic OP with optional PKCE', result: 'not-tested', description: 'The official suite has not been rerun with confidential_optional.', evidence: 'No official run' },
            { topic: 'Production discovery inspection', result: 'no-verdict', description: 'The live 0.4 API still advertises HS256 and publishes no public JWKS keys. This is a read-only configuration check, not a suite run.', evidence: '25 Sep · production fd4070e', evidenceHref: 'https://api.rooiam.com/.well-known/openid-configuration' },
            { topic: 'Live production conformance', result: 'not-tested', description: 'The official runs used isolated candidates, not api.rooiam.com.', evidence: 'No official production run' },
            { topic: 'Rooiam OIDC regression', result: 'passed', description: '11/11 local tests, including client authentication and the strict-default PKCE policy.', evidence: '25 Sep · source 752bf3e', evidenceHref: `${GITHUB_REPO_URL}/commit/752bf3e` },
        ],
        note: '* A failed Basic OP module can stop before reaching the feature it was meant to test. Config OP passed on an earlier candidate revision. Production discovery was inspected separately; no official live conformance run or certification is claimed.',
        links: [
            { label: 'Compatibility status', href: `${DOCS_BASE_URL}/reference/compatibility-and-conformance` },
            { label: 'OpenID testing guide', href: `${DOCS_BASE_URL}/production/openid-conformance-checks` },
        ],
    },
    {
        id: 'android',
        group: 'platforms',
        label: 'Android',
        shortLabel: 'One-phone beta',
        summary: 'Phone sign-in, approval and recovery passed on one Redmi.',
        scope: 'Controlled Android beta: Redmi Note 9, Android 12/API 31, Rooiam Reference from Play Internal testing.',
        lastTestedOn: '2026-09-24',
        rows: [
            { topic: 'QR browser sign-in', result: 'passed', description: 'The user scanned, matched and approved a QR; the browser entered the workspace.', evidence: '24 Sep · Play-installed Redmi' },
            { topic: 'Play Integrity verification', result: 'passed', description: 'A real Google verdict verified the enrolled reference package under strict server policy.', evidence: '24 Sep · com.rooiam.reference' },
            { topic: 'Play Protect fresh install', result: 'passed', description: 'With scanning enabled, the operator reported a Play install and scan without warning.', evidence: '24 Sep · operator-reported' },
            { topic: 'Approval after app restart', result: 'passed', description: 'A pending phone review returned after force-stop/relaunch, then explicit approval completed sign-in.', evidence: '23 Sep · assisted Redmi run' },
            { topic: 'API-key QR confirmation', result: 'passed', description: 'Approve created one key; deny and cancel created none. Test keys were revoked.', evidence: '24 Sep · production beta' },
            { topic: 'Same-phone revoke & recovery', result: 'passed', description: 'After web revocation, the Play-updated app re-enrolled without clearing data and signed in again.', evidence: '24 Sep · Reference 0.4.0-alpha.1 · code 8' },
            { topic: 'Different-phone replacement', result: 'not-tested', description: 'Only one physical phone was available; same-phone recovery does not prove this path.', evidence: 'No second handset run' },
            { topic: 'Other devices & tenant apps', result: 'not-tested', description: 'Other Android versions/vendors and independently built tenant packages need their own verification.', evidence: 'Outside recorded device scope' },
        ],
        note: 'These are controlled results for one Play Internal testing package and handset, not approval of every Android device or a public app release.',
        links: [
            { label: 'Phone sign-in walkthrough', href: `${DOCS_BASE_URL}/getting-started/android-phone-sign-in-walkthrough` },
            { label: 'Lost-phone recovery', href: `${DOCS_BASE_URL}/reference/lost-phone-and-replacement` },
        ],
    },
    {
        id: 'sdk',
        group: 'platforms',
        label: 'SDKs & examples',
        shortLabel: 'Source checked',
        summary: 'SDK source checks passed; independent adoption is open.',
        scope: 'Local/CI source checks. SDK package versions are independent of Rooiam product milestones.',
        lastTestedOn: '2026-09-25',
        rows: [
            { topic: 'Browser TypeScript SDK', result: 'passed', description: '49 tests passed; 7 were skipped. A separate project installed and imported its packed artifact.', evidence: '24–25 Sep · @rooiam/sdk-browser 0.1.0' },
            { topic: 'Server TypeScript SDK', result: 'passed', description: '26 tests passed; 5 were skipped. Its packed artifact passed a separate consumer check.', evidence: '24–25 Sep · @rooiam/sdk-server 0.1.0' },
            { topic: 'Android SDK consumer', result: 'passed', description: 'Nine JVM tests and local Maven publication passed; another app assembled against the SDK.', evidence: '23–25 Sep · android-sdk 0.4.0-alpha.1' },
            { topic: 'Android Keystore persistence', result: 'passed', description: 'A separate test app passed encrypted storage, tamper rejection and signing after process restart.', evidence: '23 Sep · physical Redmi/API 31' },
            { topic: 'Application-owned OIDC session', result: 'passed', description: 'Four reference relying-party callback/session tests passed against an isolated candidate.', evidence: '24 Sep · source example' },
            { topic: 'iOS Simulator candidate', result: 'passed', description: 'The SDK and example built for Simulator; four protocol XCTest cases passed. No real-device flow was exercised.', evidence: '24 Sep · Xcode CI run 36024016985', evidenceHref: `${GITHUB_REPO_URL}/actions/runs/36024016985` },
            { topic: 'Independent developer walkthrough', result: 'not-tested', description: 'The clean-clone exercise was agent-run; no second human completed it unaided.', evidence: 'No independent human run' },
            { topic: 'iOS on a real iPhone', result: 'not-tested', description: 'The iOS source remains experimental; simulator checks do not establish device or App Attest behavior.', evidence: 'No physical iPhone run' },
        ],
        note: 'Passing a package or example test does not mean the SDK is published to npm/Maven Central or that a tenant-built phone app is verified.',
        links: [
            { label: 'SDK support matrix', href: `${DOCS_BASE_URL}/reference/sdk-support-and-upgrade` },
            { label: 'Android integration guide', href: `${DOCS_BASE_URL}/reference/android-sdk-integration` },
        ],
    },
    {
        id: 'operations',
        group: 'operations',
        label: 'Operations',
        shortLabel: 'Local checks',
        summary: 'Isolated reliability checks passed; production rollout is open.',
        scope: 'Evidence below names the tested setup. The latest live smoke checked the existing 0.4 image; loopback probes and synthetic devices are not production capacity or a service-level guarantee.',
        lastTestedOn: '2026-09-25',
        lastTestedAt: '2026-09-25T05:06:06Z',
        rows: [
            { topic: 'Live API & integrity proxy smoke', result: 'passed', description: 'The running 0.4 API reported healthy database/Redis. The decoder rejected missing or wrong secrets (401), wrong package (403), and an invalid token (400). No real-phone journey was included.', evidence: '25 Sep · production fd4070e', evidenceHref: 'https://api.rooiam.com/health' },
            { topic: '1,000 QR login flows', result: 'passed', description: 'An isolated synthetic-device run completed 1,000 sequential flows with replay rejection.', evidence: '23 Sep · isolated 0.2 candidate' },
            { topic: 'Device failure paths', result: 'passed', description: 'Invalid Google token and verifier-unavailable cases issued no browser session.', evidence: '23 Sep · synthetic devices' },
            { topic: 'PostgreSQL 16 backup/restore', result: 'passed', description: 'A checksum-verified archive restored inside a separate network-isolated container.', evidence: '24 Sep · local 0.8 check' },
            { topic: 'Readiness probe', result: 'passed', description: '500/500 local /ready checks succeeded. This measures dependency probes, not login throughput.', evidence: '24 Sep · WSL2 loopback' },
            { topic: 'GitHub verification & Android CI', result: 'passed', description: 'The verify and Android workflows passed on the tested source candidate.', evidence: '25 Sep · CI run 36034708001', evidenceHref: `${GITHUB_REPO_URL}/actions/runs/36034708001` },
            { topic: 'GitHub secret scan', result: 'passed', description: 'The repository secret-scanning workflow passed on the same tested candidate.', evidence: '25 Sep · CI run 36034707893', evidenceHref: `${GITHUB_REPO_URL}/actions/runs/36034707893` },
            { topic: 'PostgreSQL 18 full restore', result: 'not-tested', description: 'The local rehearsal used PostgreSQL 16; a matching PostgreSQL 18 restore remains open.', evidence: 'No completed PG18 restore' },
            { topic: 'Combined 0.5–1.0 production rollout', result: 'not-tested', description: 'The matching server/portal upgrade and release-specific checks are still pending.', evidence: 'No release acceptance run' },
        ],
        note: 'The earlier controlled Android 0.3–0.4 production-beta flows are listed under Android. This category does not imply a 1.0 release or production availability target.',
        links: [
            { label: 'Backup and upgrade guide', href: `${DOCS_BASE_URL}/production/backup-restore-and-upgrade` },
            { label: 'Compatibility status', href: `${DOCS_BASE_URL}/reference/compatibility-and-conformance` },
        ],
    },
]
