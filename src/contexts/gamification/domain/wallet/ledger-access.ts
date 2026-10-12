/**
 * Capability key for the wallet's unsaved ledger entries (docs/07 §4). Only Gamification's domain
 * and its outbound repository adapters may import this module (dependency-cruiser
 * `context-access-only-in-domain-and-outbound`), so entries cannot be taken, and lost, elsewhere.
 */
export const takeNewLedgerEntries: unique symbol = Symbol(
  'takeNewLedgerEntries',
);
