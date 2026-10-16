import type { Branded } from '../../../../shared-kernel/ids.js';

/** The OAuth2 `client_id` of a brand's API client (B2B_CLIENTS.client_id, unique), e.g. `fuel-panel`. */
export type ClientId = Branded<string, 'ClientId'>;

/** 3–64 characters: lowercase letters and digits, then also `.`, `_` and `-`. */
const FORMAT = /^[a-z0-9][a-z0-9._-]{2,63}$/;

export const ClientId = {
  /** Undefined for anything that cannot be a client id; the caller answers as for an unknown one. */
  parse(raw: string): ClientId | undefined {
    return FORMAT.test(raw) ? (raw as ClientId) : undefined;
  },
};
