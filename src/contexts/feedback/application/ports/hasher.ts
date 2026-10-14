/** SHA-256 of bytes as lower-case hex; the request fingerprint is built with it (FR-AI-10). */
export interface Hasher {
  sha256Hex(bytes: Uint8Array): string;
}
