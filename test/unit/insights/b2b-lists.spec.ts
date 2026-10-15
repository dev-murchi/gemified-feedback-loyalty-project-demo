import {
  BRANCH_A1,
  BRANCH_A2,
  BRANCH_B1,
  BRAND_A,
  fid,
  reportingFixture,
  type ReportingFixture,
} from '../../support/reporting-fixture.js';

const day = (n: number, hour = 9) => new Date(Date.UTC(2026, 9, n, hour, 0, 0));

describe('B2B lists (S0-09)', () => {
  let f: ReportingFixture;

  beforeEach(() => {
    f = reportingFixture();
  });

  const listOf = async (
    query: Partial<Parameters<typeof f.listFeedbacks.execute>[0]> = {},
  ) => {
    const result = await f.listFeedbacks.execute({
      brandId: BRAND_A,
      ...query,
    });
    if (!result.ok) throw new Error(`list was rejected: ${result.error.code}`);
    return result.value;
  };

  describe('ListBranches (FR-B2B-02)', () => {
    it('lists only the brand’s own branches, ordered by id', async () => {
      const result = await f.listBranches.execute({ brandId: BRAND_A });

      expect(result).toEqual({
        ok: true,
        value: {
          items: [
            { id: BRANCH_A1, name: 'Beşiktaş', lat: 41.04, lng: 29 },
            { id: BRANCH_A2, name: 'Kadıköy', lat: 40.99, lng: 29 },
          ],
          nextCursor: null,
        },
      });
    });

    it('pages with a cursor until there is no next page', async () => {
      const first = await f.listBranches.execute({
        brandId: BRAND_A,
        limit: 1,
      });
      if (!first.ok || first.value.nextCursor === null)
        throw new Error('no next page');

      const second = await f.listBranches.execute({
        brandId: BRAND_A,
        limit: 1,
        cursor: first.value.nextCursor,
      });

      expect(first.value.items.map((b) => b.id)).toEqual([BRANCH_A1]);
      expect(second).toMatchObject({
        ok: true,
        value: { items: [{ id: BRANCH_A2 }], nextCursor: null },
      });
    });

    it.each([
      [{ limit: 0 }, 'limit'],
      [{ cursor: 'not a cursor' }, 'cursor'],
    ])('rejects %j on %s', async (query, field) => {
      expect(
        await f.listBranches.execute({ brandId: BRAND_A, ...query }),
      ).toEqual({
        ok: false,
        error: { code: 'VALIDATION_ERROR', field },
      });
    });
  });

  describe('ListBrandFeedbacks (FR-B2B-03)', () => {
    beforeEach(() => {
      f.addFeedback({
        id: fid(1),
        branchId: BRANCH_A1,
        submittedAt: day(10),
        status: 'valid',
        sentiment: 'angry',
        topicKey: 'toilet_cleanliness',
      });
      f.addFeedback({
        id: fid(2),
        branchId: BRANCH_A1,
        submittedAt: day(11),
        status: 'spam',
        sentiment: 'neutral',
        topicKey: 'other',
      });
      f.addFeedback({
        id: fid(3),
        branchId: BRANCH_A2,
        submittedAt: day(12),
        status: 'unanalyzed',
        maskedText: null,
      });
      f.addFeedback({
        id: fid(4),
        branchId: BRANCH_A2,
        submittedAt: day(13),
        status: 'analyzing',
      });
      f.addFeedback({
        id: fid(5),
        branchId: BRANCH_B1,
        submittedAt: day(14),
        status: 'valid',
        sentiment: 'happy',
        topicKey: 'price',
      });
    });

    it('lists valid and unanalyzed feedback of the brand, newest first; never spam, never another brand’s (TC-B2B-02)', async () => {
      const page = await listOf();

      expect(page.items.map((item) => item.id)).toEqual([fid(3), fid(1)]);
    });

    it('returns only the contract’s fields: no user id, no device, no raw text (TC-B2B-03, FR-B2B-06)', async () => {
      const page = await listOf();

      for (const item of page.items)
        expect(Object.keys(item).sort()).toEqual([
          'branchId',
          'id',
          'sentiment',
          'status',
          'submittedAt',
          'textMasked',
          'topic',
        ]);
      expect(JSON.stringify(page)).not.toContain(
        'a0000000-0000-4000-8000-0000000000aa',
      );
    });

    it('names the topic, and leaves text, sentiment and topic null for an unanalyzed feedback without masked text (FR-B2B-07)', async () => {
      const page = await listOf();

      expect(page.items).toEqual([
        {
          id: fid(3),
          branchId: BRANCH_A2,
          submittedAt: day(12),
          status: 'unanalyzed',
          textMasked: null,
          sentiment: null,
          topic: null,
        },
        {
          id: fid(1),
          branchId: BRANCH_A1,
          submittedAt: day(10),
          status: 'valid',
          textMasked: 'Maskeli yorum',
          sentiment: 'angry',
          topic: { key: 'toilet_cleanliness', name: 'Tuvalet temizliği' },
        },
      ]);
    });

    it('keeps a topic key the current label set no longer has as its own name', async () => {
      f.addFeedback({
        id: fid(6),
        branchId: BRANCH_A1,
        submittedAt: day(15),
        status: 'valid',
        sentiment: 'neutral',
        topicKey: 'car_wash',
      });

      expect((await listOf()).items[0]?.topic).toEqual({
        key: 'car_wash',
        name: 'car_wash',
      });
    });

    it.each([
      [{ branchId: BRANCH_A1 }, [fid(1)]],
      [{ sentiment: 'angry' as const }, [fid(1)]],
      [{ topicKey: 'toilet_cleanliness' }, [fid(1)]],
      [{ from: '2026-10-11', to: '2026-10-13' }, [fid(3)]],
    ])('filters by %j', async (query, ids) => {
      expect((await listOf(query)).items.map((item) => item.id)).toEqual(ids);
    });

    it('answers 404 for another brand’s branch, so its existence does not leak (TC-B2B-01, FR-B2B-08)', async () => {
      expect(
        await f.listFeedbacks.execute({
          brandId: BRAND_A,
          branchId: BRANCH_B1,
        }),
      ).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
    });

    it('rejects a branch id that is not a UUID as VALIDATION_ERROR', async () => {
      expect(
        await f.listFeedbacks.execute({
          brandId: BRAND_A,
          branchId: 'kadikoy',
        }),
      ).toEqual({
        ok: false,
        error: { code: 'VALIDATION_ERROR', field: 'branchId' },
      });
    });

    it('pages newest first without repeating or skipping when a feedback arrives meanwhile (TC-B2B-06)', async () => {
      const first = await listOf({ limit: 1 });
      f.addFeedback({
        id: fid(7),
        branchId: BRANCH_A1,
        submittedAt: day(15),
        status: 'valid',
        sentiment: 'happy',
        topicKey: 'price',
      });
      const second = await listOf({ limit: 1, cursor: first.nextCursor ?? '' });

      expect(first.items.map((item) => item.id)).toEqual([fid(3)]);
      expect(second.items.map((item) => item.id)).toEqual([fid(1)]);
      expect(second.nextCursor).toBeNull();
    });

    it('counts a comment at 23:30 Istanbul time in the Istanbul day (TC-B2B-07)', async () => {
      // 2026-10-05 23:30 in Istanbul is 20:30 UTC on the 5th
      f.addFeedback({
        id: fid(8),
        branchId: BRANCH_A1,
        submittedAt: new Date('2026-10-05T20:30:00Z'),
        status: 'valid',
        sentiment: 'happy',
        topicKey: 'price',
      });

      expect(
        (await listOf({ from: '2026-10-05', to: '2026-10-06' })).items.map(
          (i) => i.id,
        ),
      ).toEqual([fid(8)]);
      expect(
        (await listOf({ from: '2026-10-06', to: '2026-10-07' })).items,
      ).toEqual([]);
    });
  });
});
