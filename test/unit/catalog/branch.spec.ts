import {
  Branch,
  type QrIssuing,
} from '../../../src/contexts/catalog/domain/branch/branch.js';
import type { QrToken } from '../../../src/contexts/catalog/domain/branch/qr-token.js';
import {
  aBranch,
  BRANCH_ID,
  BRAND_ID,
} from '../../support/catalog-builders.js';
import { FakeClock } from '../../support/fake-clock.js';
import { SequentialIdGenerator } from '../../support/sequential-id-generator.js';
import { SequentialRandomSource } from '../../support/sequential-random-source.js';

const clock = new FakeClock(new Date('2026-10-12T09:00:00.000Z'));
const issuing = (): QrIssuing => ({
  random: new SequentialRandomSource(),
  ids: new SequentialIdGenerator(),
  clock,
});

describe('Branch', () => {
  it('issues an active QR code with a freshly generated token at the current time', () => {
    // Given a branch without QR codes
    const branch = aBranch({ qrCodes: 0 });

    // When a QR code is issued
    const code = branch.issueQrCode(issuing());

    // Then it is active, dated now, and its token is accepted
    expect(code.status).toBe('active');
    expect(code.createdAt).toEqual(clock.now());
    expect(branch.accepts(code.token)).toBe(true);
  });

  it('finds the active code of a token, as a copy, and no code once it is revoked', () => {
    // Given a branch with one QR code
    const branch = aBranch({ qrCodes: 0 });
    const code = branch.issueQrCode(issuing());

    // When the found code is changed by the caller, and the code is then revoked
    const found = branch.activeQrCode(code.token);
    found?.createdAt.setUTCFullYear(2030);
    branch.revokeQrCode(code.token, clock.now());

    // Then it was the code, the branch kept its date, and a revoked code is not found
    expect(found?.id).toBe(code.id);
    expect(branch.qrCodes[0]?.createdAt).toEqual(clock.now());
    expect(branch.activeQrCode(code.token)).toBeUndefined();
  });

  it('issues a different token for every QR code', () => {
    // Given a branch and one source of randomness
    const branch = aBranch({ qrCodes: 0 });
    const deps = issuing();

    // When two QR codes are issued
    const first = branch.issueQrCode(deps);
    const second = branch.issueQrCode(deps);

    // Then their tokens differ
    expect(second.token).not.toBe(first.token);
  });

  it('no longer accepts a revoked token, while its replacement is accepted (FR-QR-01)', () => {
    // Given a branch with one QR code
    const branch = aBranch({ qrCodes: 0 });
    const deps = issuing();
    const original = branch.issueQrCode(deps);

    // When the code is revoked and a replacement is issued
    branch.revokeQrCode(original.token, clock.now());
    const replacement = branch.issueQrCode(deps);

    // Then only the replacement is accepted
    expect(branch.accepts(original.token)).toBe(false);
    expect(branch.accepts(replacement.token)).toBe(true);
  });

  it('keeps a revoked code revoked, with its first revocation time, when revoked again', () => {
    // Given a revoked QR code
    const branch = aBranch({ qrCodes: 0 });
    const code = branch.issueQrCode(issuing());
    const firstRevocation = new Date('2026-10-12T10:00:00.000Z');
    branch.revokeQrCode(code.token, firstRevocation);

    // When it is revoked again later
    const result = branch.revokeQrCode(
      code.token,
      new Date('2026-10-13T10:00:00.000Z'),
    );

    // Then it reports "already revoked", nothing changes and it is still not accepted
    expect(result).toEqual({ ok: true, value: 'already_revoked' });
    expect(branch.qrCodes[0]?.revokedAt).toEqual(firstRevocation);
    expect(branch.accepts(code.token)).toBe(false);
  });

  it('reports a first revocation as "revoked"', () => {
    // Given an active QR code
    const branch = aBranch({ qrCodes: 0 });
    const code = branch.issueQrCode(issuing());

    // When it is revoked
    const result = branch.revokeQrCode(code.token, clock.now());

    // Then the outcome says it was revoked
    expect(result).toEqual({ ok: true, value: 'revoked' });
  });

  it('cannot be changed through the dates of the QR codes it returns', () => {
    // Given a branch with a revoked QR code
    const branch = aBranch({ qrCodes: 0 });
    const issued = branch.issueQrCode(issuing());
    const revokedAt = new Date('2026-10-12T10:00:00.000Z');
    branch.revokeQrCode(issued.token, revokedAt);

    // When a caller changes the dates of the codes it got back
    issued.createdAt.setTime(0);
    branch.qrCodes[0]?.createdAt.setTime(0);
    branch.qrCodes[0]?.revokedAt?.setTime(0);
    revokedAt.setTime(0);

    // Then the branch still has the original dates
    expect(branch.qrCodes[0]?.createdAt).toEqual(clock.now());
    expect(branch.qrCodes[0]?.revokedAt).toEqual(
      new Date('2026-10-12T10:00:00.000Z'),
    );
  });

  it('reports NOT_FOUND when revoking a token it does not own', () => {
    // Given a branch and a token of another branch
    const branch = aBranch({ qrCodes: 0 });
    const foreign = aBranch({ qrCodes: 1 }).qrCodes[0]?.token as QrToken;

    // When the foreign token is revoked
    const result = branch.revokeQrCode(foreign, clock.now());

    // Then it is not found and not accepted
    expect(result.ok ? undefined : result.error.code).toBe('NOT_FOUND');
    expect(branch.accepts(foreign)).toBe(false);
  });

  it('rejects an empty name', () => {
    // Given a name of only spaces
    // When a branch is created with it
    const result = Branch.create({
      id: BRANCH_ID,
      brandId: BRAND_ID,
      name: '   ',
      location: { lat: 41, lng: 29 },
    });

    // Then it is a validation error
    expect(result.ok ? undefined : result.error.code).toBe('VALIDATION_ERROR');
  });
});
