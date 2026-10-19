import { randomUUID } from 'node:crypto';
import { FakeDevice } from '../../test/support/fake-device.js';
import { simBranches } from './catalog.js';
import { parseJson, type RawJson } from './json.js';
import { feedbackProof } from './requests.js';

export interface RouteRequest {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  /** The request body's bytes, untouched. */
  readonly body: Buffer;
  /** The `Idempotency-Key` request header, if the caller sent one. */
  readonly idempotencyKey: string | undefined;
}

export interface RouteResult {
  readonly status: number;
  readonly body: unknown;
}

type Platform = 'ios' | 'android';

/** `fail`: the platform check fails at registration, so the account is low trust (no rewards). */
type Integrity = 'pass' | 'fail';

interface SimDevice {
  readonly id: string;
  readonly platform: Platform;
  readonly integrity: Integrity;
  readonly phone: FakeDevice;
}

/** The simulated phones (only their keys) by id, so a phone can be used again until restart. */
const devices = new Map<string, SimDevice>();

const fail = (status: number, error: string): RouteResult => ({
  status,
  body: { error },
});

/** GET /qr: the content of each branch's QR code. */
function qr(): RouteResult {
  return { status: 200, body: { items: simBranches() } };
}

function deviceFor(
  platform: Platform,
  query: URLSearchParams,
): SimDevice | undefined {
  const deviceId = query.get('deviceId');
  if (deviceId !== null) {
    const known = devices.get(deviceId);
    return known?.platform === platform ? known : undefined;
  }
  const created = {
    id: randomUUID(),
    platform,
    integrity: query.get('integrity') === 'fail' ? 'fail' : 'pass',
    phone: new FakeDevice(),
  } as const;
  devices.set(created.id, created);
  return created;
}

const keyIdOf = (device: SimDevice): string =>
  device.platform === 'ios'
    ? device.phone.iosKeyId
    : device.phone.androidKeyIdentifier;

/** What the phone signs over the nonce; empty until the caller has asked the backend for one. */
function nonceValues(device: SimDevice, nonce: string | null): object {
  if (nonce === null) return {};
  const options = { integrity: device.integrity };
  const evidence =
    device.platform === 'ios'
      ? device.phone.iosEvidence(nonce, options)
      : device.phone.androidEvidence(nonce, options);
  return {
    register: { ...evidence, nonce },
    session: device.phone.sessionBody(device.platform, nonce),
  };
}

/**
 * GET /devices?platform=ios|android: what a phone produces by itself. The simulator does not know the
 * backend and sends nothing to it: the caller gets a nonce from `POST /v1/auth/challenge` (single
 * use, 60 seconds), passes it as `?nonce=`, and builds the requests from the values.
 * `register` and `session` are both signed over that one nonce; send only one of them.
 *
 * Optional `?deviceId=` gives the same phone again (its key is already registered); without it a
 * new phone is made, and `?integrity=fail` (default `pass`) makes it one whose registration is low
 * trust: the account works but earns no rewards.
 */
function device(platform: Platform, query: URLSearchParams): RouteResult {
  const device = deviceFor(platform, query);
  if (device === undefined) return fail(404, 'Bu deviceId bu platformda yok');
  return {
    status: 200,
    body: {
      deviceId: device.id,
      platform,
      integrity: device.integrity,
      keyId: keyIdOf(device),
      nonce: query.get('nonce'),
      ...nonceValues(device, query.get('nonce')),
    },
  };
}

/** The payload as given: printed verbatim when it is JSON, else as a plain string. */
const payloadView = (text: string): RawJson | string =>
  parseJson(text) === undefined ? text : { rawJson: text };

/**
 * POST /devices/{deviceId}/feedback, with the body you will send to `POST /v1/feedbacks` as the
 * body. The simulator does not read or change it: it signs those exact bytes and returns the
 * signature. An `Idempotency-Key` header you send is used as it is, otherwise a UUID is made. The
 * proof comes from the key the backend knows, so the phone must be the registered one.
 */
function signFeedback(deviceId: string, request: RouteRequest): RouteResult {
  const phone = devices.get(deviceId);
  if (phone === undefined) return fail(404, 'Bu deviceId yok');
  if (request.body.length === 0)
    return fail(
      400,
      "Gövde boş: POST /v1/feedbacks'e göndereceğin payload'ı gövde olarak ver",
    );
  const proof = feedbackProof(
    phone.phone,
    request.body,
    request.idempotencyKey,
  );
  return {
    status: 200,
    body: {
      deviceId,
      idempotencyKey: proof.idempotencyKey,
      payload: payloadView(request.body.toString('utf8')),
      xPlatformProof: proof.xPlatformProof,
    },
  };
}

const FEEDBACK_PATH = /^\/devices\/([0-9a-f-]{36})\/feedback$/;

function get(path: string, query: URLSearchParams): RouteResult {
  switch (path) {
    case '/qr':
      return qr();
    case '/devices': {
      const platform = query.get('platform');
      return platform === 'ios' || platform === 'android'
        ? device(platform, query)
        : fail(400, 'platform parametresi "ios" veya "android" olmalı');
    }
    default:
      return fail(404, 'Böyle bir adres yok');
  }
}

/** The whole API of the simulator: three GET routes and one POST. */
export function handle(request: RouteRequest): RouteResult {
  if (request.method === 'GET') return get(request.path, request.query);
  const deviceId = FEEDBACK_PATH.exec(request.path)?.[1];
  if (request.method === 'POST' && deviceId !== undefined)
    return signFeedback(deviceId, request);
  return fail(404, 'Böyle bir adres yok');
}
