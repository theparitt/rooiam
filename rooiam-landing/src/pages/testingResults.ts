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
    id: 'openid' | 'android' | 'sdk' | 'web' | 'operations'
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
            { topic: 'Production discovery inspection', result: 'no-verdict', description: 'The 0.4 API advertised HS256 and published no public JWKS keys when inspected. This historical configuration check was not a suite run or a verdict on the later deployment.', evidence: '25 Sep · production fd4070e', evidenceHref: 'https://api.rooiam.com/.well-known/openid-configuration' },
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
        lastTestedOn: '2026-09-25',
        lastTestedAt: '2026-09-25T05:07:15Z',
        rows: [
            { topic: 'QR browser sign-in', result: 'passed', description: 'After the 0.4 server restart, the user scanned and approved a production QR on the same Redmi; Incognito entered the workspace.', evidence: '25 Sep · assisted production run · fd4070e' },
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
        id: 'web',
        group: 'platforms',
        label: 'Web consoles',
        shortLabel: 'Deployment smoke',
        summary: 'Both live consoles show the server build; sign-in needs a separate check.',
        scope: 'Production app.rooiam.com and admin.rooiam.com, checked without an authenticated user session. A deploy and page-load check does not prove a login journey.',
        lastTestedOn: '2026-09-25',
        lastTestedAt: '2026-09-25T08:26:27Z',
        rows: [
            { topic: 'Tenant portal build badge', result: 'passed', description: 'Production served the new JavaScript; desktop and mobile screenshots showed the server commit and locally formatted build time at bottom right without covering sign-in controls.', evidence: '25 Sep · app commit 57da0c4', evidenceHref: `${GITHUB_REPO_URL}/commit/57da0c4` },
            { topic: 'Admin console build badge', result: 'passed', description: 'Production served the new JavaScript; desktop and mobile screenshots showed the same server build badge without covering sign-in controls.', evidence: '25 Sep · admin commit 02695da', evidenceHref: `${GITHUB_REPO_URL}/commit/02695da` },
            { topic: 'Live build data & browser access', result: 'passed', description: 'Both origins could read /health through CORS. The API reported the running source commit 8c245cb6, and /ready found PostgreSQL and Redis healthy.', evidence: '25 Sep · production API', evidenceHref: 'https://api.rooiam.com/health' },
            { topic: 'Admin lint script', result: 'blocked', description: 'The command could not run because the admin project has no ESLint configuration. TypeScript and the production build passed; this is not a source lint verdict.', evidence: '25 Sep · local admin command' },
            { topic: 'Authenticated portal journeys', result: 'not-tested', description: 'Workspace, admin and phone sign-in flows were not rerun after these console deployments.', evidence: 'Separate acceptance run needed' },
        ],
        note: 'These checks cover published assets, visible build metadata and API reachability. They do not certify sign-in, admin permissions or the 0.5–1.0 release.',
        links: [
            { label: 'Tenant portal', href: 'https://app.rooiam.com/' },
            { label: 'Admin console', href: 'https://admin.rooiam.com/' },
        ],
    },
    {
        id: 'operations',
        group: 'operations',
        label: 'Operations',
        shortLabel: 'Live health checked',
        summary: 'The new backend is healthy; release acceptance and full recovery remain open.',
        scope: 'Evidence below names the tested revision. Earlier 0.4 checks remain historical; readiness probes and synthetic devices are not authentication capacity or a service-level guarantee.',
        lastTestedOn: '2026-09-25',
        lastTestedAt: '2026-09-25T08:43:12Z',
        rows: [
            { topic: 'Production backend image & readiness', result: 'passed', description: 'The running image and /health identified source commit 8c245cb6 and its build time; /ready and database/Redis checks passed. Startup reported migrations OK with no restart.', evidence: '25 Sep · production 8c245cb', evidenceHref: 'https://api.rooiam.com/health' },
            { topic: 'Protected API & CORS smoke', result: 'passed', description: 'Health, readiness, OpenAPI, discovery and JWKS returned 200. Four protected reads and a profile write rejected missing authentication with 401; app/admin profile preflights passed CORS. No authenticated journey was exercised.', evidence: '25 Sep · production 8c245cb' },
            { topic: 'Server library regression', result: 'passed', description: '134 local library tests passed against a disposable PostgreSQL database; 13 integration cases remained explicitly ignored. Two earlier setup attempts failed before the correct test database was selected.', evidence: '25 Sep · source d5548b7', evidenceHref: `${GITHUB_REPO_URL}/commit/d5548b7` },
            { topic: 'Earlier API & integrity proxy smoke', result: 'passed', description: 'The then-running 0.4 API reported healthy database/Redis. The decoder rejected missing or wrong secrets (401), wrong package (403), and an invalid token (400). This historical run did not include a real-phone journey.', evidence: '25 Sep · production fd4070e' },
            { topic: '1,000 QR login flows', result: 'passed', description: 'An isolated synthetic-device run completed 1,000 sequential flows with replay rejection.', evidence: '23 Sep · isolated 0.2 candidate' },
            { topic: 'Device failure paths', result: 'passed', description: 'Invalid Google token and verifier-unavailable cases issued no browser session.', evidence: '23 Sep · synthetic devices' },
            { topic: 'QR and phone-revocation regression', result: 'passed', description: 'Rerun on current source: an isolated two-identity simulation checked limits, MFA, restart, lost completion response, replay, revocation and log redaction. No physical phone or real vendor verdict was involved.', evidence: '25 Sep · isolated matrix-only run' },
            { topic: 'API-key approval regression', result: 'passed', description: 'Rerun on current source: isolated checks covered all three policy modes, signed request binding, deny, cancel, replay, race, expiry, role changes and recent-sign-in revocation.', evidence: '25 Sep · isolated action run' },
            { topic: 'PostgreSQL 16 backup/restore', result: 'passed', description: 'A checksum-verified archive restored inside a separate network-isolated container.', evidence: '24 Sep · local 0.8 check' },
            { topic: 'Production PostgreSQL 18 restore', result: 'passed', description: 'A fresh production dump passed checksum validation and fully restored to a disposable network-isolated PostgreSQL 18 container; 64 successful migrations were present.', evidence: '25 Sep · existing 0.4 database' },
            { topic: 'Migration 65 preflight', result: 'passed', description: 'All 64 prior checksums matched. Migration 65 applied to a restored PostgreSQL 18 copy and preserved the policy mapping; the later production server reported migrations OK at startup.', evidence: '25 Sep · isolated copy and live startup' },
            { topic: 'Readiness probe', result: 'passed', description: 'Production loopback /ready succeeded 200/200 times at concurrency 4; an earlier isolated run succeeded 500/500. Neither measured login throughput.', evidence: '25 Sep · production 0.4; 24 Sep · local' },
            { topic: 'GitHub verification & Android CI', result: 'passed', description: 'The verify and Android workflows passed on the tested source candidate.', evidence: '25 Sep · CI run 36034708001', evidenceHref: `${GITHUB_REPO_URL}/actions/runs/36034708001` },
            { topic: 'GitHub secret scan', result: 'passed', description: 'The repository secret-scanning workflow passed on the same tested candidate.', evidence: '25 Sep · CI run 36034707893', evidenceHref: `${GITHUB_REPO_URL}/actions/runs/36034707893` },
            { topic: '0.5 · Developer integration', result: 'not-tested', description: 'TypeScript/Android SDK artifacts and the app-owned OIDC session example passed isolated checks. A fresh independent developer walkthrough and a production relying-party callback/refresh recheck remain open.', evidence: 'Source checked; live integration open' },
            { topic: '0.6 · Tenant boundaries', result: 'not-tested', description: 'Owner transfer, role and API-key boundaries passed isolated checks. A live cross-workspace/owner-transfer run on a disposable workspace has not been done after this deployment.', evidence: 'Isolated pass; live matrix open' },
            { topic: '0.7 · API-key phone policy', result: 'not-tested', description: 'Off, owner-keys-only and all-keys modes passed isolated tests. The production owner settings and real-phone confirmation matrix still need a disposable-workspace run.', evidence: 'Isolated pass; live matrix open' },
            { topic: '0.8 · Self-host recovery', result: 'not-tested', description: 'A production PostgreSQL backup restored in isolation and migration 65 passed preflight. A full restore including media, secrets and an off-host copy has not been proven.', evidence: 'Database restore passed; full drill open' },
            { topic: '0.9 · iOS exploration', result: 'not-tested', description: 'The experimental SDK/example passed iOS Simulator checks. No physical iPhone, App Attest or distribution test has been run; iOS is outside the supported 1.0 matrix.', evidence: 'Simulator only' },
            { topic: '1.0 · Stable release', result: 'review', description: 'The backend and portals are deployed, but there is no 1.0 tag or completed acceptance matrix. OpenID Config OP passed on an isolated candidate; Basic OP did not pass. Certification is not claimed.', evidence: 'Release and conformance review open' },
        ],
        note: 'The 0.5–1.0 rows describe remaining release evidence, not whether code exists. The restored PostgreSQL archive is a database-only backup on the production host; healthy startup does not imply a 1.0 release or availability target.',
        links: [
            { label: 'Backup and upgrade guide', href: `${DOCS_BASE_URL}/production/backup-restore-and-upgrade` },
            { label: 'Compatibility status', href: `${DOCS_BASE_URL}/reference/compatibility-and-conformance` },
            { label: 'Version roadmap', href: `${DOCS_BASE_URL}/roadmap` },
        ],
    },
]
