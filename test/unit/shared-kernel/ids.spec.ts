import { BranchId, UserId } from '../../../src/shared-kernel/ids.js';
import { err, ok } from '../../../src/shared-kernel/result.js';
import { SequentialIdGenerator } from '../../support/sequential-id-generator.js';

describe('typed ids', () => {
  it('accepts a UUID and normalises it to lower case', () => {
    // Given a UUID in upper case
    const raw = '3F0C2A9E-6B1D-4C7E-9A52-1D2E3F4A5B6C';

    // When a UserId is created from it
    const result = UserId.create(raw);

    // Then it succeeds with the lower-case form
    expect(result).toEqual(ok('3f0c2a9e-6b1d-4c7e-9a52-1d2e3f4a5b6c'));
  });

  it('rejects a value that is not a UUID with VALIDATION_ERROR', () => {
    // Given a malformed id
    const raw = 'not-a-uuid';

    // When a BranchId is created from it
    const result = BranchId.create(raw);

    // Then it fails as a format error
    expect(result).toEqual(err({ code: 'VALIDATION_ERROR', value: raw }));
  });

  it('generates new ids from the id generator', () => {
    // Given an id generator
    const ids = new SequentialIdGenerator();

    // When two ids are generated
    const first = UserId.generate(ids);
    const second = UserId.generate(ids);

    // Then each comes from the generator and they differ
    expect(first).toBe('00000000-0000-4000-8000-000000000001');
    expect(second).not.toBe(first);
  });
});
