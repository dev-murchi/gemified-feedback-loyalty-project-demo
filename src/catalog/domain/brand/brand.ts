import { AggregateRoot } from '../../../shared-kernel/aggregate-root.js';
import type { DomainError } from '../../../shared-kernel/domain-error.js';
import type { BrandId } from '../../../shared-kernel/ids.js';
import { err, ok, type Result } from '../../../shared-kernel/result.js';
import type { Sector } from '../sector.js';

export interface BrandState {
  readonly id: BrandId;
  readonly name: string;
  readonly sector: Sector;
}

export interface InvalidBrand extends DomainError<'VALIDATION_ERROR'> {
  readonly field: 'name';
}

/** A company using the platform (docs/06 §5.2). Reference data, defined by the seed script (V-4). */
export class Brand extends AggregateRoot {
  readonly #state: BrandState;

  private constructor(state: BrandState, version: number) {
    super(version);
    this.#state = state;
  }

  static create(brand: BrandState): Result<Brand, InvalidBrand> {
    const name = brand.name.trim();
    return name === ''
      ? err({ code: 'VALIDATION_ERROR', field: 'name' })
      : ok(new Brand({ ...brand, name }, 0));
  }

  static reconstitute(state: BrandState, version: number): Brand {
    return new Brand(state, version);
  }

  get id(): BrandId {
    return this.#state.id;
  }

  get name(): string {
    return this.#state.name;
  }

  get sector(): Sector {
    return this.#state.sector;
  }
}
