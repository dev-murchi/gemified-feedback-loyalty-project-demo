import type { Clock } from '../../../../shared-kernel/clock.js';
import { err, ok, type Result } from '../../../../shared-kernel/result.js';
import type { TokenRejection } from '../../domain/b2b-client/token-errors.js';
import type { B2bClient } from '../../domain/b2b-client/b2b-client.js';
import { parseScopes, type Scope } from '../../domain/scope.js';
import type { B2bAccessTokens } from '../ports/b2b-access-tokens.js';
import type { B2bClientRepository } from '../ports/b2b-client-repository.js';
import type { SecretHasher } from '../ports/secret-hasher.js';

export interface IssueB2bTokenDeps {
  readonly clients: B2bClientRepository;
  readonly hasher: SecretHasher;
  readonly tokens: B2bAccessTokens;
  readonly clock: Clock;
  /** A hash of a random secret, checked when the client is unknown so both cases take as long. */
  readonly decoyHash: string;
}

/** The form fields of POST /v1/b2b/oauth/token (RFC 6749 §4.4), as received. */
export interface IssueB2bTokenCommand {
  readonly grantType: string | undefined;
  readonly clientId: string | undefined;
  readonly clientSecret: string | undefined;
  readonly scope: string | undefined;
}

/** The contract's `B2bToken`. */
export interface B2bTokenGrant {
  readonly accessToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresIn: number;
  readonly scope: string;
}

/** The form after its own checks: both credentials present, the grant type and the scopes known. */
interface CheckedRequest {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly scopes: Scope[];
}

function checkRequest(
  cmd: IssueB2bTokenCommand,
): Result<CheckedRequest, TokenRejection> {
  if (cmd.clientId === undefined || cmd.clientSecret === undefined)
    return err({ error: 'invalid_request' });
  if (cmd.grantType !== 'client_credentials')
    return err({ error: 'unsupported_grant_type' });
  const scopes = parseScopes(cmd.scope ?? '');
  if (scopes === undefined) return err({ error: 'invalid_scope' });
  return ok({ clientId: cmd.clientId, clientSecret: cmd.clientSecret, scopes });
}

/**
 * POST /v1/b2b/oauth/token, client credentials (FR-B2B-01). An unknown client, a wrong secret, and a
 * revoked or expired client all answer invalid_client the same way (TC-B2B-05); the secret of an
 * unknown client is still checked against a decoy hash, so the answer's timing does not tell
 * whether a client id exists. An absent or empty `scope` means all the client's scopes.
 */
export class IssueB2bToken {
  constructor(private readonly deps: IssueB2bTokenDeps) {}

  async execute(
    cmd: IssueB2bTokenCommand,
  ): Promise<Result<B2bTokenGrant, TokenRejection>> {
    const request = checkRequest(cmd);
    if (!request.ok) return request;
    const client = await this.#authenticate(request.value);
    if (client === undefined) return err({ error: 'invalid_client' });
    const scopes = client.grant(request.value.scopes, this.deps.clock.now());
    if (!scopes.ok) return scopes;
    const token = await this.deps.tokens.issue({
      clientId: client.clientId,
      brandId: client.brandId,
      scopes: scopes.value,
    });
    return ok({
      accessToken: token.accessToken,
      tokenType: 'Bearer',
      expiresIn: token.expiresIn,
      scope: scopes.value.join(' '),
    });
  }

  /** The client if the secret is right; the decoy hash keeps an unknown id as slow as a known one. */
  async #authenticate(request: CheckedRequest): Promise<B2bClient | undefined> {
    const client = await this.deps.clients.findById(request.clientId);
    const hash = client?.secretHash ?? this.deps.decoyHash;
    const matches = await this.deps.hasher.verify(request.clientSecret, hash);
    return matches ? client : undefined;
  }
}
