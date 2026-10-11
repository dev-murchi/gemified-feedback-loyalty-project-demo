/** Time is a dependency, so tests can control it with a fake (docs/07 §2, §9). */
export interface Clock {
  now(): Date;
}
