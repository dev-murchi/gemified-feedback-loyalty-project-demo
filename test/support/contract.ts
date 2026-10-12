import { readFileSync } from 'node:fs';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { ERROR_STATUS } from '../../src/platform/http/error-codes.js';

// Checks real HTTP responses against docs/api/openapi.yaml (bundled and dereferenced by Redocly in
// the e2e global setup). The contract is the source of truth: a response that it does not allow is
// a bug in the code or a gap in the contract.

/** One request and the response the API gave. */
export interface Exchange {
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly headers: Readonly<Record<string, unknown>>;
  readonly body: unknown;
}

interface ResponseDefinition {
  readonly content?: Record<string, { readonly schema?: object }>;
  readonly headers?: Record<string, { readonly required?: boolean }>;
}

interface OperationDefinition {
  readonly responses: Record<string, ResponseDefinition>;
}

interface ContractDocument {
  readonly paths: Record<string, Record<string, OperationDefinition>>;
  readonly components: { readonly schemas: { readonly Problem: object } };
}

/**
 * The error catalog (the API description) lists these for every operation, although individual
 * operations do not repeat them: the 8 KB limit and unexpected server errors.
 */
const CATALOG_WIDE_STATUSES = new Set([413, 500]);

const PROBLEM_MEDIA = 'application/problem+json';

/** A response header as text; the headers we compare are always plain strings. */
const headerText = (value: unknown): string =>
  typeof value === 'string' ? value : '';

/** `application/problem+json; charset=utf-8` → `application/problem+json`. */
const mediaTypeOf = (headers: Readonly<Record<string, unknown>>): string =>
  headerText(headers['content-type']).split(';')[0] ?? '';

/**
 * A response must carry no property its schema does not declare. JSON Schema allows extras by
 * default, which would let an accidental leak (an internal field) pass; the contract's objects are
 * closed in practice, so the check closes them.
 */
function closed(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(closed);
  if (typeof schema !== 'object' || schema === null) return schema;
  const copy = Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [key, closed(value)]),
  ) as Record<string, unknown>;
  const isPlainObject =
    copy['type'] === 'object' &&
    copy['properties'] !== undefined &&
    copy['additionalProperties'] === undefined &&
    copy['oneOf'] === undefined &&
    copy['anyOf'] === undefined;
  return isPlainObject ? { ...copy, additionalProperties: false } : copy;
}

export class Contract {
  readonly #document: ContractDocument;
  readonly #ajv = new Ajv2020({ strict: false, allErrors: true });
  readonly #validators = new Map<object, ValidateFunction>();

  constructor(path: string) {
    this.#document = JSON.parse(readFileSync(path, 'utf8')) as ContractDocument;
    addFormatsModule.default(this.#ajv);
  }

  /** What is wrong with this exchange, in words; empty if the response matches the contract. */
  violationsOf(exchange: Exchange): string[] {
    const label = `${exchange.method} ${exchange.path} → ${exchange.status}`;
    const definition = this.#responseDefinition(exchange);
    if (definition === undefined)
      return [`${label}: status is not documented for this operation`];
    return [
      ...this.#contentViolations(exchange, definition),
      ...this.#headerViolations(exchange, definition),
      ...this.#problemViolations(exchange),
    ].map((message) => `${label}: ${message}`);
  }

  /** The operation's own definition of this status, or the catalog-wide Problem for 404/413/500. */
  #responseDefinition(exchange: Exchange): ResponseDefinition | undefined {
    const operation = this.#operationFor(exchange);
    const own = operation?.responses[String(exchange.status)];
    if (own !== undefined) return own;
    const catalogWide =
      CATALOG_WIDE_STATUSES.has(exchange.status) ||
      (operation === undefined && exchange.status === 404);
    return catalogWide ? this.#anyProblem() : undefined;
  }

  #operationFor(exchange: Exchange): OperationDefinition | undefined {
    for (const [template, operations] of Object.entries(this.#document.paths)) {
      const pattern = new RegExp(
        `^${template.replace(/\{[^}]+\}/g, '[^/]+')}$`,
      );
      if (pattern.test(exchange.path))
        return operations[exchange.method.toLowerCase()];
    }
    return undefined;
  }

  #anyProblem(): ResponseDefinition {
    return {
      content: {
        [PROBLEM_MEDIA]: { schema: this.#document.components.schemas.Problem },
      },
      headers: { 'X-Request-Id': {} },
    };
  }

  #contentViolations(
    exchange: Exchange,
    definition: ResponseDefinition,
  ): string[] {
    const documented = definition.content ?? {};
    if (Object.keys(documented).length === 0)
      return exchange.body === undefined || exchange.body === ''
        ? []
        : ['the contract documents no body'];
    const media = mediaTypeOf(exchange.headers);
    const schema = documented[media]?.schema;
    return schema === undefined
      ? [
          `content type "${media}" is not documented (${Object.keys(documented).join(', ')})`,
        ]
      : this.#bodyViolations(exchange.body, schema);
  }

  #bodyViolations(body: unknown, schema: object): string[] {
    const validate = this.#validatorFor(schema);
    return validate(body)
      ? []
      : (validate.errors ?? []).map(
          (error) =>
            `body${error.instancePath} ${error.message ?? 'is invalid'}`,
        );
  }

  #validatorFor(schema: object): ValidateFunction {
    const known = this.#validators.get(schema);
    if (known !== undefined) return known;
    const compiled = this.#ajv.compile(closed(schema) as object);
    this.#validators.set(schema, compiled);
    return compiled;
  }

  #headerViolations(
    exchange: Exchange,
    definition: ResponseDefinition,
  ): string[] {
    const sent = new Set(
      Object.keys(exchange.headers).map((name) => name.toLowerCase()),
    );
    return Object.entries(definition.headers ?? {})
      .filter(
        ([name, header]) =>
          header.required !== false && !sent.has(name.toLowerCase()),
      )
      .map(([name]) => `documented header ${name} is missing`);
  }

  /** An error's code must be the one the catalog gives this status (one table, tested elsewhere). */
  #problemViolations(exchange: Exchange): string[] {
    const code = (exchange.body as { code?: unknown } | undefined)?.code;
    if (
      mediaTypeOf(exchange.headers) !== PROBLEM_MEDIA ||
      typeof code !== 'string'
    )
      return [];
    const expected = (ERROR_STATUS as Record<string, number>)[code];
    return expected === exchange.status
      ? []
      : [`code ${code} belongs to status ${String(expected)}`];
  }
}
