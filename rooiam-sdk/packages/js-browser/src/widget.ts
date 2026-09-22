/** Hosted widget accepts app identity only; redirect targets are server-owned. */
export type HostedLoginOptions = {
  apiOrigin: string
  workspaceId: string
} & ({ preview: true; clientId?: string | null } | { preview?: false; clientId: string })

export function buildHostedLoginUrl(options: HostedLoginOptions): string {
  const url = new URL('/login-widget', options.apiOrigin)
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('HTTP(S) origin required')
  const workspace = options.workspaceId.trim()
  const client = options.clientId?.trim()
  if (!workspace) throw new Error('workspaceId is required')
  if (!options.preview && !client) throw new Error('clientId is required')
  if (options.preview) url.searchParams.set('preview', '1')
  url.searchParams.set('workspace_id', workspace)
  if (client) url.searchParams.set('client_id', client)
  return url.toString()
}
