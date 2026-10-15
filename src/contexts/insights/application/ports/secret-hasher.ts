/**
 * Hashes and checks client secrets (SDD 7.3): a slow, salted hash, compared in constant time. The
 * hash text says how it was made, so the parameters can change later.
 */
export interface SecretHasher {
  hash(secret: string): Promise<string>;
  /** False for a wrong secret and for a hash it cannot read; never throws for either. */
  verify(secret: string, hash: string): Promise<boolean>;
}
