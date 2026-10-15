/** The B2B scopes (docs/api/openapi.yaml `b2bOAuth`): feedback lists and topics, or summaries and the heatmap. */
export const SCOPES = ['b2b.feedback.read', 'b2b.summary.read'] as const;

export type Scope = (typeof SCOPES)[number];

export const isScope = (value: string): value is Scope =>
  (SCOPES as readonly string[]).includes(value);

/**
 * The OAuth2 `scope` parameter: space-separated scopes, each once; undefined if any is unknown.
 * An empty or blank parameter gives [], which the token use case treats like an absent one.
 */
export function parseScopes(value: string): Scope[] | undefined {
  const names = value.split(' ').filter((name) => name !== '');
  if (!names.every(isScope)) return undefined;
  return [...new Set(names)];
}
