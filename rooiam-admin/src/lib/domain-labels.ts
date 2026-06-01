// Canonical user-facing terminology for the admin console.
// Keep this aligned with rooiam-app/src/lib/domain-labels.ts and docs/internal/08_domain_model.md.
// API field names still use org/tenant/client in many places for compatibility with the server contract.
// Do not rename transport keys just to match UI wording unless the backend contract changes too.
// Membership terminology:
// - Members = everyone in a workspace
// - Workspace Admins = owners/admins
// - Users = non-admin members
export const WORKSPACE_LABEL = 'Workspace'
export const WORKSPACE_LABEL_PLURAL = 'Workspaces'
export const WORKSPACE_LABEL_LOWER = 'workspace'
export const WORKSPACE_LABEL_PLURAL_LOWER = 'workspaces'

export const APP_LABEL = 'App'
export const APP_LABEL_PLURAL = 'Apps'
export const APP_LABEL_LOWER = 'app'
export const APP_LABEL_PLURAL_LOWER = 'apps'

export const LOGIN_LABEL = 'Login'
export const MEMBERS_LABEL = 'Members'
