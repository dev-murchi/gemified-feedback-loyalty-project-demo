/**
 * An expected business outcome other than success. It is a value returned inside a Result,
 * never thrown. Codes match the API error catalog (docs/07 §6).
 */
export interface DomainError<Code extends string = string> {
  readonly code: Code;
}
