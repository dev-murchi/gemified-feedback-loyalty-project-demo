// Demo data checks. Only this file and the composition root may touch the demo folder; other
// tests build their data with test/support/catalog-builders.ts.

import { demoCatalogDefinition } from '../../../src/contexts/catalog/adapters/inbound/demo/demo-catalog.definition.js';
import { loadDemoCatalog } from '../../../src/contexts/catalog/adapters/inbound/demo/demo-catalog-loader.js';
import { demoCatalogSnapshot } from '../../../src/contexts/catalog/adapters/inbound/demo/demo-catalog.snapshot.js';
import {
  completeDemoSnapshot,
  type DemoCatalogSnapshot,
} from '../../../src/contexts/catalog/adapters/inbound/demo/demo-snapshot.js';
import { ResolveQr } from '../../../src/contexts/catalog/application/use-cases/resolve-qr.js';
import type { QrIssuing } from '../../../src/contexts/catalog/domain/branch/branch.js';
import { LabelSet } from '../../../src/contexts/catalog/domain/label-set/label-set.js';
import type { BrandId } from '../../../src/shared-kernel/ids.js';
import { FakeClock } from '../../support/fake-clock.js';
import { memoryCatalogHarness } from '../../support/memory-catalog.js';
import { SequentialIdGenerator } from '../../support/sequential-id-generator.js';
import { SequentialRandomSource } from '../../support/sequential-random-source.js';

const issuing = (): QrIssuing => ({
  random: new SequentialRandomSource(),
  ids: new SequentialIdGenerator(),
  clock: new FakeClock(),
});

const firstBranch = (snapshot: DemoCatalogSnapshot) => {
  const [key, branch] = Object.entries(snapshot.branches)[0] ?? [];
  if (key === undefined || branch === undefined)
    throw new Error('empty snapshot');
  return { key, branch };
};

const withExtraBranch = (
  snapshot: DemoCatalogSnapshot,
  key: string,
): DemoCatalogSnapshot => ({
  ...snapshot,
  branches: { ...snapshot.branches, [key]: firstBranch(snapshot).branch },
});

const withFirstBranchId = (
  snapshot: DemoCatalogSnapshot,
  id: string,
): DemoCatalogSnapshot => {
  const { key, branch } = firstBranch(snapshot);
  return {
    ...snapshot,
    branches: { ...snapshot.branches, [key]: { ...branch, id } },
  };
};

const demoTokens = (snapshot: DemoCatalogSnapshot): string[] =>
  Object.values(snapshot.branches).flatMap((branch) =>
    branch.qrCodes.map((code) => code.token),
  );

describe('demo catalog data', () => {
  it('has an id and a QR code for every brand and branch of the definition', () => {
    // Given the committed snapshot and definition
    // Then every definition key has an entry with at least one QR code
    expect(Object.keys(demoCatalogSnapshot.brands)).toEqual(
      demoCatalogDefinition.brands.map((brand) => brand.key),
    );
    expect(Object.keys(demoCatalogSnapshot.branches)).toEqual(
      demoCatalogDefinition.branches.map((branch) => branch.key),
    );
    expect(
      Object.values(demoCatalogSnapshot.branches).every(
        (b) => b.qrCodes.length > 0,
      ),
    ).toBe(true);
  });

  it('has QR tokens of 16 random bytes each, all different (FR-QR-01)', () => {
    // Given the committed demo tokens
    const tokens = demoTokens(demoCatalogSnapshot);

    // Then each decodes to 16 bytes and none repeats
    expect(
      tokens.map((token) => Buffer.from(token, 'base64url').length),
    ).toEqual(tokens.map(() => 16));
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('has valid label sets that all contain `other` (docs/06 §5.2)', () => {
    // Given the demo label sets
    // When each is created
    const results = demoCatalogDefinition.labelSets.map((input) =>
      LabelSet.create(input),
    );

    // Then all are valid and contain `other`
    expect(results.every((result) => result.ok)).toBe(true);
    expect(
      results.every(
        (r) => r.ok && r.value.topics.some((topic) => topic.key === 'other'),
      ),
    ).toBe(true);
  });
});

describe('completeDemoSnapshot (scripts/generate-demo-catalog.ts)', () => {
  it('keeps existing ids and tokens and issues only for new branches', () => {
    // Given a snapshot that lacks the last branch of the definition
    const lastKey = demoCatalogDefinition.branches.at(-1)?.key ?? '';
    const complete = completeDemoSnapshot(
      demoCatalogDefinition,
      { brands: {}, branches: {} },
      issuing(),
    );
    const known = Object.fromEntries(
      Object.entries(complete.branches).filter(([key]) => key !== lastKey),
    );
    const existing: DemoCatalogSnapshot = {
      brands: complete.brands,
      branches: known,
    };

    // When the snapshot is completed again
    const completed = completeDemoSnapshot(
      demoCatalogDefinition,
      existing,
      issuing(),
    );

    // Then existing entries are unchanged and only the missing branch was added
    expect(completed.brands).toEqual(existing.brands);
    expect(completed.branches).toMatchObject(known);
    expect(completed.branches[lastKey]?.qrCodes).toHaveLength(1);
  });

  it('changes nothing when every entry already exists', () => {
    // Given a complete snapshot
    const complete = completeDemoSnapshot(
      demoCatalogDefinition,
      { brands: {}, branches: {} },
      issuing(),
    );

    // When it is completed again
    const again = completeDemoSnapshot(
      demoCatalogDefinition,
      complete,
      issuing(),
    );

    // Then it is identical
    expect(again).toEqual(complete);
  });

  it('fails instead of dropping an entry that has no definition', () => {
    // Given a snapshot with a branch that was removed from the definition
    const withOrphan = withExtraBranch(demoCatalogSnapshot, 'removed-branch');

    // When it is completed
    const complete = () =>
      completeDemoSnapshot(demoCatalogDefinition, withOrphan, issuing());

    // Then it fails, so the printed QR code is not silently lost
    expect(complete).toThrow();
  });
});

describe('loadDemoCatalog', () => {
  it('loads the demo catalog so that every demo QR token resolves to its brand sector', async () => {
    // Given empty Catalog storage
    const harness = await memoryCatalogHarness();

    // When the demo catalog is loaded
    await loadDemoCatalog(harness);

    // Then every demo token resolves, fuel branches to fuel and coffee branches to coffee
    const resolver = new ResolveQr(harness);
    for (const branch of demoCatalogDefinition.branches) {
      const token =
        demoCatalogSnapshot.branches[branch.key]?.qrCodes[0]?.token ?? '';
      const result = await resolver.resolve(token);
      expect(result.ok && result.value.sector).toBe(branch.brandKey);
    }
  });

  it.each([
    [
      'an entry without a definition',
      withExtraBranch(demoCatalogSnapshot, 'removed-branch'),
    ],
    ['a malformed id', withFirstBranchId(demoCatalogSnapshot, 'not-a-uuid')],
  ])(
    'refuses a snapshot with %s and stores nothing',
    async (_case, snapshot) => {
      // Given empty Catalog storage
      const harness = await memoryCatalogHarness();

      // When the demo catalog is loaded from the faulty snapshot
      const load = loadDemoCatalog(harness, {
        definition: demoCatalogDefinition,
        snapshot,
      });

      // Then it fails and no brand was stored
      await expect(load).rejects.toThrow();
      const brandId = Object.values(demoCatalogSnapshot.brands)[0]?.id ?? '';
      expect(await harness.brands.findById(brandId as BrandId)).toBeUndefined();
    },
  );
});
