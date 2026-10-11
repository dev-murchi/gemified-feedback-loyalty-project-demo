// Typed ids are branded strings: plain strings at runtime, distinct types at compile time,
// so a BranchId cannot be passed where a UserId is expected.

import type { DomainError } from './domain-error.js';
import type { IdGenerator } from './id-generator.js';
import { err, ok, type Result } from './result.js';

declare const brand: unique symbol;

/** A type that is a plain `T` at runtime but cannot be mixed up with other brandings of `T`. */
export type Branded<T, Name extends string> = T & { readonly [brand]: Name };

/** A malformed id is a format problem, reported as VALIDATION_ERROR (docs/07 §6). */
export interface InvalidId extends DomainError<'VALIDATION_ERROR'> {
  readonly value: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface IdFactory<Id extends string> {
  /** Validates an id coming from outside (request, database). */
  create(raw: string): Result<Id, InvalidId>;
  /** Issues a new id from a trusted generator. */
  generate(ids: IdGenerator): Id;
}

/** Factory for a UUID-based typed id; contexts use it for their own ids (e.g. QrCodeId). */
export function typedId<Id extends string>(): IdFactory<Id> {
  return {
    create: (raw) =>
      UUID.test(raw)
        ? ok(raw.toLowerCase() as Id)
        : err({ code: 'VALIDATION_ERROR', value: raw }),
    generate: (ids) => ids.next().toLowerCase() as Id,
  };
}

export type UserId = Branded<string, 'UserId'>;
export const UserId = typedId<UserId>();

export type BrandId = Branded<string, 'BrandId'>;
export const BrandId = typedId<BrandId>();

export type BranchId = Branded<string, 'BranchId'>;
export const BranchId = typedId<BranchId>();

export type FeedbackId = Branded<string, 'FeedbackId'>;
export const FeedbackId = typedId<FeedbackId>();
