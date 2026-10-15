import { z } from 'zod';

// Query shapes of docs/api/openapi.yaml, format only: whether a date, a cursor or a branch id is
// good is the domain's decision. A repeated parameter (an array) is a format error.

const text = z.string();

/** `limit` arrives as text; only plain digits become a number (the domain checks 1–100). */
const limit = z.string().regex(/^\d+$/, 'must be an integer').transform(Number);

export const RangeQuery = z.object({
  from: text.optional(),
  to: text.optional(),
  timeZone: text.optional(),
});

export const PageQuery = z.object({
  cursor: z.string().max(512).optional(),
  limit: limit.optional(),
});

export const FeedbackListQuery = RangeQuery.extend(PageQuery.shape).extend({
  branchId: text.optional(),
  sentiment: z
    .enum(['happy', 'satisfied', 'neutral', 'disappointed', 'angry'])
    .optional(),
  topicKey: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/)
    .optional(),
});
