/**
 * Why a token request was refused, as RFC 6749 §5.2 names it. The OAuth2 token endpoint is the one
 * exception to Problem Details (docs/07 §6): these are its `error` values, not API error codes.
 */
export type TokenRejection =
  | { readonly error: 'invalid_request' }
  | { readonly error: 'unsupported_grant_type' }
  | { readonly error: 'invalid_client' }
  | { readonly error: 'invalid_scope' };
