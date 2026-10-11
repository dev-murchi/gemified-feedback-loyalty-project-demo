/** Source of new UUIDs; randomness is a dependency like time (docs/07 §2). */
export interface IdGenerator {
  next(): string;
}
