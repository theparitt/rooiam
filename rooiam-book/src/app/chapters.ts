export type Chapter = { num: string; title: string; slug: string }

export const CHAPTERS: Chapter[] = [
  { num: '',   title: 'Preface',                    slug: '' },
  { num: '1',  title: 'The Core Database',           slug: 'chapter-01-the-identity-core' },
  { num: '2',  title: 'Magic Link Authentication',   slug: 'chapter-02-magic-link-authentication' },
  { num: '3',  title: 'Stateful Sessions',           slug: 'chapter-03-stateful-sessions' },
  { num: '4',  title: 'Social Logins',               slug: 'chapter-04-social-logins' },
  { num: '5',  title: 'Multi-Tenant Architecture',   slug: 'chapter-05-multi-tenant-organizations' },
  { num: '6',  title: 'The OIDC Provider',           slug: 'chapter-06-the-oidc-provider' },
  { num: '7',  title: 'Threat Modeling',             slug: 'chapter-07-threat-modeling' },
  { num: '8',  title: 'Permissions & Roles',         slug: 'chapter-08-rbac-roles' },
  { num: '9',  title: 'MFA & Passkeys',              slug: 'chapter-09-mfa-passkeys' },
  { num: '10', title: 'Audit Logs',                  slug: 'chapter-10-activity-audit-logs' },
  { num: '11', title: 'Machine Identity & API Keys', slug: 'chapter-11-api-keys' },
  { num: '12', title: 'Corporate Guardrails',        slug: 'chapter-12-corporate-guardrails' },
];
