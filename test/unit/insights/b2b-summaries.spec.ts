import {
  BRANCH_A1,
  BRANCH_A2,
  BRANCH_B1,
  BRAND_A,
  BRAND_B,
  fid,
  reportingFixture,
  type ReportingFixture,
  type SeededFeedback,
} from '../../support/reporting-fixture.js';

const day = (n: number, hour = 9) => new Date(Date.UTC(2026, 9, n, hour, 0, 0));

describe('B2B summaries (S0-09)', () => {
  let f: ReportingFixture;

  beforeEach(() => {
    f = reportingFixture();
  });

  describe('GetBranchSummary (FR-B2B-04)', () => {
    beforeEach(() => {
      const add = (
        n: number,
        labels: Pick<SeededFeedback, 'status' | 'sentiment' | 'topicKey'>,
      ) =>
        f.addFeedback({
          id: fid(n),
          branchId: BRANCH_A1,
          submittedAt: day(10, n),
          ...labels,
        });
      add(1, {
        status: 'valid',
        sentiment: 'angry',
        topicKey: 'toilet_cleanliness',
      });
      add(2, {
        status: 'valid',
        sentiment: 'angry',
        topicKey: 'toilet_cleanliness',
      });
      add(3, {
        status: 'valid',
        sentiment: 'disappointed',
        topicKey: 'wait_time',
      });
      add(4, { status: 'valid', sentiment: 'happy', topicKey: 'price' });
      add(5, {
        status: 'valid',
        sentiment: 'neutral',
        topicKey: 'staff_attitude',
      });
      add(6, {
        status: 'valid',
        sentiment: 'happy',
        topicKey: 'pump_equipment',
      });
      add(7, { status: 'valid', sentiment: 'happy', topicKey: 'other' });
      add(8, {
        status: 'spam',
        sentiment: 'angry',
        topicKey: 'toilet_cleanliness',
      });
      add(9, { status: 'unanalyzed' });
    });

    it('counts sentiments, complaints and unanalyzed feedback; spam not at all (TC-B2B-02)', async () => {
      const result = await f.summary.execute({
        brandId: BRAND_A,
        branchId: BRANCH_A1,
        from: '2026-10-10',
        to: '2026-10-11',
      });

      expect(result).toMatchObject({
        ok: true,
        value: {
          branchId: BRANCH_A1,
          from: '2026-10-10T00:00:00+03:00',
          to: '2026-10-11T00:00:00+03:00',
          timeZone: 'Europe/Istanbul',
          totalFeedbacks: 8,
          complaintCount: 3,
          unanalyzedCount: 1,
          sentimentDistribution: {
            happy: 3,
            satisfied: 0,
            neutral: 1,
            disappointed: 1,
            angry: 2,
          },
        },
      });
    });

    it('lists at most five topics, the most frequent first, ties by key, with names', async () => {
      const result = await f.summary.execute({
        brandId: BRAND_A,
        branchId: BRANCH_A1,
        from: '2026-10-10',
        to: '2026-10-11',
      });

      expect(result.ok && result.value.topTopics).toEqual([
        { key: 'toilet_cleanliness', name: 'Tuvalet temizliği', count: 2 },
        { key: 'other', name: 'Diğer', count: 1 },
        { key: 'price', name: 'Fiyat', count: 1 },
        { key: 'pump_equipment', name: 'Pompa/ekipman', count: 1 },
        { key: 'staff_attitude', name: 'Personel tutumu', count: 1 },
      ]);
    });

    it.each([
      ['another brand’s branch', BRANCH_B1],
      ['an unknown branch', 'c0000000-0000-4000-8000-0000000000ff'],
      ['a malformed id', 'kadikoy'],
    ])('answers 404 for %s (TC-B2B-01)', async (_case, branchId) => {
      expect(await f.summary.execute({ brandId: BRAND_A, branchId })).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
    });

    it('answers another brand’s question about its own branch normally', async () => {
      const result = await f.summary.execute({
        brandId: BRAND_B,
        branchId: BRANCH_B1,
      });

      expect(result).toMatchObject({ ok: true, value: { totalFeedbacks: 0 } });
    });
  });

  describe('GetHeatmap (FR-B2B-05)', () => {
    it('gives every branch of the brand with coordinates and counts, a quiet one included', async () => {
      f.addFeedback({
        id: fid(1),
        branchId: BRANCH_A1,
        submittedAt: day(10),
        status: 'valid',
        sentiment: 'angry',
        topicKey: 'price',
      });
      f.addFeedback({
        id: fid(2),
        branchId: BRANCH_A1,
        submittedAt: day(10, 10),
        status: 'unanalyzed',
      });
      f.addFeedback({
        id: fid(3),
        branchId: BRANCH_A1,
        submittedAt: day(10, 11),
        status: 'spam',
        sentiment: 'angry',
        topicKey: 'price',
      });
      f.addFeedback({
        id: fid(4),
        branchId: BRANCH_B1,
        submittedAt: day(10),
        status: 'valid',
        sentiment: 'angry',
        topicKey: 'price',
      });

      const result = await f.heatmap.execute({
        brandId: BRAND_A,
        from: '2026-10-01',
      });

      expect(result).toMatchObject({
        ok: true,
        value: {
          timeZone: 'Europe/Istanbul',
          items: [
            {
              branchId: BRANCH_A1,
              name: 'Beşiktaş',
              lat: 41.04,
              lng: 29,
              feedbackCount: 2,
              complaintCount: 1,
            },
            {
              branchId: BRANCH_A2,
              name: 'Kadıköy',
              lat: 40.99,
              lng: 29,
              feedbackCount: 0,
              complaintCount: 0,
            },
          ],
        },
      });
    });

    it('rejects an invalid range', async () => {
      expect(
        await f.heatmap.execute({ brandId: BRAND_A, from: '2026-02-30' }),
      ).toEqual({
        ok: false,
        error: { code: 'VALIDATION_ERROR', field: 'from' },
      });
    });
  });

  it('ListTopics gives the brand sector’s current topics and their label-set version', async () => {
    const topics = await f.topics.execute({ brandId: BRAND_A });

    expect(topics).toMatchObject({ sector: 'fuel', labelSetVersion: 2 });
    expect(topics.items[0]).toEqual({
      key: 'toilet_cleanliness',
      name: 'Tuvalet temizliği',
    });
  });
});
