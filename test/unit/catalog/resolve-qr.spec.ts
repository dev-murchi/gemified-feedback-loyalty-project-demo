import { ResolveQr } from '../../../src/contexts/catalog/application/use-cases/resolve-qr.js';
import type { QrToken } from '../../../src/contexts/catalog/domain/branch/qr-token.js';
import {
  aBranch,
  aBrand,
  BRANCH_ID,
  BRAND_ID,
} from '../../support/catalog-builders.js';
import {
  memoryCatalogHarness,
  type CatalogHarness,
} from '../../support/memory-catalog.js';

describe('ResolveQr (QrResolver)', () => {
  let harness: CatalogHarness;
  let resolver: ResolveQr;
  let active: QrToken;
  let activeId: string;
  let revoked: QrToken;

  beforeEach(async () => {
    // Given a coffee brand with a branch that has one revoked and one active QR code
    harness = await memoryCatalogHarness();
    resolver = new ResolveQr(harness);
    const branch = aBranch({ qrCodes: 2 });
    [revoked, active] = branch.qrCodes.map((code) => code.token) as [
      QrToken,
      QrToken,
    ];
    activeId = branch.qrCodes[1]?.id ?? '';
    branch.revokeQrCode(revoked, new Date('2026-10-12T10:00:00.000Z'));
    await harness.uow.run(async () => {
      await harness.brands.save(aBrand({ sector: 'coffee' }));
      await harness.branches.save(branch);
    });
  });

  it('resolves an active token to its code, branch, brand and sector (FR-QR-01)', async () => {
    // When the active token is resolved
    const result = await resolver.resolve(active);

    // Then it points to the branch and its brand
    expect(result).toEqual({
      ok: true,
      value: {
        qrCodeId: activeId,
        branchId: BRANCH_ID,
        brandId: BRAND_ID,
        sector: 'coffee',
      },
    });
  });

  it.each([
    ['a revoked token', () => revoked],
    ['an unknown token', () => 'AAAAAAAAAAAAAAAAAAAAAA'],
    ['a malformed token', () => 'not a token'],
  ])('rejects %s with QR_INVALID (FR-QR-02)', async (_case, token) => {
    // When the token is resolved
    const result = await resolver.resolve(token());

    // Then it is rejected as QR_INVALID
    expect(result.ok ? undefined : result.error.code).toBe('QR_INVALID');
  });
});
