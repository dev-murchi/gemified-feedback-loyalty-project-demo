import { ResolveQr } from '../../../src/contexts/catalog/application/use-cases/resolve-qr.js';
import { RevokeQrCode } from '../../../src/contexts/catalog/application/use-cases/revoke-qr-code.js';
import type { QrToken } from '../../../src/contexts/catalog/domain/branch/qr-token.js';
import { aBranch, aBrand, BRANCH_ID } from '../../support/catalog-builders.js';
import { ConcurrencyConflictError } from '../../../src/shared-kernel/concurrency-conflict-error.js';
import { ConflictingBranchRepository } from '../../support/conflicting-branch-repository.js';
import { FakeClock } from '../../support/fake-clock.js';
import {
  memoryCatalogHarness,
  type CatalogHarness,
} from '../../support/memory-catalog.js';

describe('RevokeQrCode', () => {
  const clock = new FakeClock(new Date('2026-10-12T12:00:00.000Z'));
  let harness: CatalogHarness;
  let revokeQrCode: RevokeQrCode;
  let leaked: QrToken;
  let kept: QrToken;

  beforeEach(async () => {
    // Given a branch with two active QR codes
    harness = await memoryCatalogHarness();
    revokeQrCode = new RevokeQrCode({ ...harness, clock });
    const branch = aBranch({ qrCodes: 2 });
    [leaked, kept] = branch.qrCodes.map((code) => code.token) as [
      QrToken,
      QrToken,
    ];
    await harness.uow.run(async () => {
      await harness.brands.save(aBrand());
      await harness.branches.save(branch);
    });
  });

  it('revokes the code, so its token is no longer resolved while the other code still is', async () => {
    // When the leaked code is revoked
    const result = await revokeQrCode.execute({ token: leaked });

    // Then only the other token still resolves
    const resolver = new ResolveQr(harness);
    expect(result.ok).toBe(true);
    expect((await resolver.resolve(leaked)).ok).toBe(false);
    expect((await resolver.resolve(kept)).ok).toBe(true);
  });

  it('stores when the code was revoked', async () => {
    // When the leaked code is revoked
    await revokeQrCode.execute({ token: leaked });

    // Then the stored code carries the revocation time
    const branch = await harness.branches.findById(BRANCH_ID);
    const code = branch?.qrCodes.find(
      (candidate) => candidate.token === leaked,
    );
    expect(code?.revokedAt).toEqual(clock.now());
  });

  it('reports NOT_FOUND for a token no branch owns', async () => {
    // When an unknown token is revoked
    const result = await revokeQrCode.execute({
      token: 'AAAAAAAAAAAAAAAAAAAAAA',
    });

    // Then it is not found
    expect(result.ok ? undefined : result.error.code).toBe('NOT_FOUND');
  });

  it('reports QR_INVALID for a malformed token', async () => {
    // When a malformed token is revoked
    const result = await revokeQrCode.execute({ token: 'not a token' });

    // Then it is invalid
    expect(result.ok ? undefined : result.error.code).toBe('QR_INVALID');
  });

  it('returns ok and stores nothing when the code is already revoked', async () => {
    // Given a code that was revoked
    await revokeQrCode.execute({ token: leaked });
    const versionAfterFirst = (await harness.branches.findById(BRANCH_ID))
      ?.version;

    // When it is revoked again
    const result = await revokeQrCode.execute({ token: leaked });

    // Then the caller gets ok and the stored branch did not change
    expect(result.ok).toBe(true);
    expect((await harness.branches.findById(BRANCH_ID))?.version).toBe(
      versionAfterFirst,
    );
  });

  it('reloads and revokes again after one concurrency conflict', async () => {
    // Given a branch repository that conflicts on the first save
    const branches = new ConflictingBranchRepository(harness.branches, 1);
    const revoke = new RevokeQrCode({ branches, uow: harness.uow, clock });

    // When the code is revoked
    const result = await revoke.execute({ token: leaked });

    // Then the branch was loaded twice and the code is revoked
    expect(result.ok).toBe(true);
    expect(branches.loads).toBe(2);
    expect((await new ResolveQr(harness).resolve(leaked)).ok).toBe(false);
  });

  it('lets a second conflict reach the caller and changes nothing', async () => {
    // Given a branch repository that conflicts on every save
    const branches = new ConflictingBranchRepository(harness.branches, 2);
    const revoke = new RevokeQrCode({ branches, uow: harness.uow, clock });

    // When the code is revoked
    const run = revoke.execute({ token: leaked });

    // Then the conflict is thrown after two attempts and the token still resolves
    await expect(run).rejects.toBeInstanceOf(ConcurrencyConflictError);
    expect(branches.loads).toBe(2);
    expect((await new ResolveQr(harness).resolve(leaked)).ok).toBe(true);
  });
});
