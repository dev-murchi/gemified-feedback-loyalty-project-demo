/** Source of cryptographically secure random bytes; randomness is a dependency (docs/07 §2). */
export interface RandomSource {
  bytes(length: number): Uint8Array;
}
