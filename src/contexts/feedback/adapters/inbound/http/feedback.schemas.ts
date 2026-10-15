import { z } from 'zod';

/**
 * `FeedbackSubmission` of docs/api/openapi.yaml, format only: no extra fields, both strings. The
 * text length and the token's validity are the domain's decisions (TEXT_TOO_SHORT/LONG, QR_INVALID),
 * so they are not checked here.
 */
export const FeedbackSubmission = z
  .object({ qrToken: z.string(), text: z.string() })
  .strict();
