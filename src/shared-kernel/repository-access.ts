/**
 * Capability keys that only repositories may use (docs/07 §4). Holding a key is the only way to
 * call the method it names, and dependency-cruiser (`repository-access-only-in-outbound-adapters`)
 * allows importing this module only from aggregate-root.ts, outbound repository adapters and
 * shared-kernel adapters. So events cannot be taken, and lost, anywhere else.
 */
export const takeEvents: unique symbol = Symbol('takeEvents');

/** After a successful save the repository sets the instance's version to the stored version. */
export const markSaved: unique symbol = Symbol('markSaved');
