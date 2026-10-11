// Typed ids are branded strings: plain strings at runtime, distinct types at compile time,
// so a BranchId cannot be passed where a UserId is expected.

import type { DomainError } from './domain-error.js';
import type { IdGenerator } from './id-generator.js';
import { err, ok, type Result } from './result.js';

declare const brand: unique symbol;

export type Brand<T, Name extends string> = T & { readonly [brand]: Name };

/** A malformed id is a format problem, reported as VALIDATION_ERROR (docs/07 §6). */
export interface InvalidId extends DomainError<'VALIDATION_ERROR'> {
  readonly value: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface IdFactory<Id extends string> {
  /** Validates an id coming from outside (request, database). */
  create(raw: string): Result<Id, InvalidId>;
  /** Issues a new id from a trusted generator. */
  generate(ids: IdGenerator): Id;
}

function idFactory<Id extends string>(): IdFactory<Id> {
  return {
    create: (raw) =>
      UUID.test(raw)
        ? ok(raw.toLowerCase() as Id)
        : err({ code: 'VALIDATION_ERROR', value: raw }),
    generate: (ids) => ids.next().toLowerCase() as Id,
  };
}

export type UserId = Brand<string, 'UserId'>;
export const UserId = idFactory<UserId>();

export type BrandId = Brand<string, 'BrandId'>;
export const BrandId = idFactory<BrandId>();

export type BranchId = Brand<string, 'BranchId'>;
export const BranchId = idFactory<BranchId>();

export type FeedbackId = Brand<string, 'FeedbackId'>;
export const FeedbackId = idFactory<FeedbackId>();
