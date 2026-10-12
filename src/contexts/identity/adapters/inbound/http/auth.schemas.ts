import { z } from 'zod';

// Request shapes of docs/api/openapi.yaml. Format only: whether a nonce, key or signature is good
// is the domain's decision. Registration bodies forbid additional properties, as the contract says.

const registerIos = z
  .object({
    platform: z.literal('ios'),
    nonce: z.string(),
    keyId: z.string(),
    attestationObject: z.string(),
  })
  .strict();

const registerAndroid = z
  .object({
    platform: z.literal('android'),
    nonce: z.string(),
    certificateChain: z.array(z.string()).min(2).max(10),
    integrityToken: z.string(),
  })
  .strict();

export const RegisterRequest = z.discriminatedUnion('platform', [
  registerIos,
  registerAndroid,
]);

const sessionIos = z.object({
  platform: z.literal('ios'),
  keyId: z.string(),
  nonce: z.string(),
  assertion: z.string(),
});

const sessionAndroid = z.object({
  platform: z.literal('android'),
  keyId: z.string(),
  nonce: z.string(),
  signature: z.string(),
});

export const SessionRequest = z.discriminatedUnion('platform', [
  sessionIos,
  sessionAndroid,
]);
