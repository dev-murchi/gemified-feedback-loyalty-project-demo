import request from 'supertest';
import type { Problem } from '../../src/platform/http/problem-details.js';
import {
  GOOD_TOKEN,
  PRINCIPAL,
  startHttpTestApp,
  type HttpTestApp,
} from '../support/http-test-app.js';

const problemOf = (response: { body: unknown }): Problem =>
  response.body as Problem;

describe('platform HTTP defaults (e2e)', () => {
  let server: HttpTestApp;

  beforeEach(async () => {
    server = await startHttpTestApp();
  });

  afterEach(async () => {
    await server.app.close();
  });

  const http = () => request(server.app.getHttpServer());

  describe('errors as Problem Details', () => {
    it('answers an expected outcome with its catalog status, content type and request id', async () => {
      // When a handler raises KEY_REVOKED
      const response = await http().get('/test/expected');

      // Then it is a 403 problem+json with the id also in the header
      expect(response.status).toBe(403);
      expect(response.headers['content-type']).toMatch(
        /^application\/problem\+json/,
      );
      expect(response.body).toEqual({
        type: 'https://errors.example.invalid/key-revoked',
        title: 'Cihaz anahtarı iptal edilmiş',
        status: 403,
        code: 'KEY_REVOKED',
        requestId: response.headers['x-request-id'],
      });
    });

    it('carries retryAfterSeconds in the body of a 422, with no Retry-After header', async () => {
      const response = await http().get('/test/cooldown');

      expect(response.status).toBe(422);
      expect(problemOf(response).retryAfterSeconds).toBe(3600);
      expect(response.headers['retry-after']).toBeUndefined();
    });

    it('sends Retry-After with a RATE_LIMITED problem, equal to retryAfterSeconds', async () => {
      const response = await http().get('/test/limited');

      expect(response.status).toBe(429);
      expect(response.headers['retry-after']).toBe('30');
      expect(problemOf(response).retryAfterSeconds).toBe(30);
    });

    it('lists the invalid field of a validation error', async () => {
      const response = await http().get('/test/invalid');

      expect(response.status).toBe(400);
      expect(problemOf(response).errors).toEqual([
        { field: 'keyId', message: 'invalid value' },
      ]);
    });

    it('hides an unexpected error behind INTERNAL_ERROR and logs it with the request id', async () => {
      // When a handler throws an error with internal details
      const response = await http().get('/test/boom');

      // Then the client learns nothing about it, and the log has the request id but not the text
      expect(response.status).toBe(500);
      expect(problemOf(response).code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(response.body)).not.toContain('hunter2');
      expect(server.logger.warnings).toHaveLength(1);
      expect(server.logger.warnings[0]?.fields['requestId']).toBe(
        problemOf(response).requestId,
      );
      expect(JSON.stringify(server.logger.warnings)).not.toContain('hunter2');
    });

    it('answers a second concurrency conflict with INTERNAL_ERROR (docs/07 §5)', async () => {
      const response = await http().get('/test/conflict');

      expect(response.status).toBe(500);
      expect(problemOf(response).code).toBe('INTERNAL_ERROR');
    });

    it('answers an unknown route with NOT_FOUND', async () => {
      const response = await http().get('/test/nothing-here');

      expect(response.status).toBe(404);
      expect(problemOf(response).code).toBe('NOT_FOUND');
    });

    it('answers malformed JSON with VALIDATION_ERROR', async () => {
      const response = await http()
        .post('/test/echo')
        .set('Content-Type', 'application/json')
        .send('{"broken":');

      expect(response.status).toBe(400);
      expect(problemOf(response).code).toBe('VALIDATION_ERROR');
    });

    it('answers a body over 8 KB with PAYLOAD_TOO_LARGE, and the problem has a request id', async () => {
      const response = await http()
        .post('/test/echo')
        .send({ text: 'x'.repeat(9 * 1024) });

      expect(response.status).toBe(413);
      expect(problemOf(response).code).toBe('PAYLOAD_TOO_LARGE');
      expect(problemOf(response).requestId).toBe(
        response.headers['x-request-id'],
      );
    });

    it('accepts a body just under the limit', async () => {
      const response = await http()
        .post('/test/echo')
        .send({ text: 'x'.repeat(7 * 1024) });

      expect(response.status).toBe(201);
    });
  });

  describe('body validation', () => {
    it('answers 400 VALIDATION_ERROR with the offending fields', async () => {
      const response = await http()
        .post('/test/validated')
        .send({ count: 1.5, extra: true });

      expect(response.status).toBe(400);
      expect(problemOf(response).code).toBe('VALIDATION_ERROR');
      expect(problemOf(response).errors?.map((error) => error.field)).toEqual([
        'nonce',
        'count',
        'extra',
      ]);
    });

    it('lets a valid body through', async () => {
      const body = { nonce: 'n', count: 2 };
      const response = await http().post('/test/validated').send(body);

      expect(response.status).toBe(201);
      expect(response.body).toEqual(body);
    });
  });

  it('does not announce the framework in a header (T-I7)', async () => {
    const ok = await http().post('/test/echo').send({});
    const failed = await http().get('/test/boom');

    expect(ok.headers['x-powered-by']).toBeUndefined();
    expect(failed.headers['x-powered-by']).toBeUndefined();
  });

  describe('request id', () => {
    it('echoes an acceptable id from the caller', async () => {
      const response = await http()
        .get('/test/expected')
        .set('X-Request-Id', 'client-123');

      expect(response.headers['x-request-id']).toBe('client-123');
      expect(problemOf(response).requestId).toBe('client-123');
    });

    it('makes one when the caller sent none or an unusable one', async () => {
      const none = await http().get('/test/expected');
      const bad = await http()
        .get('/test/expected')
        .set('X-Request-Id', 'has space');

      expect(none.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      expect(bad.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('bearer guard (mobileBearer)', () => {
    it('lets a valid token through and hands the caller to the handler', async () => {
      const response = await http()
        .get('/test/private')
        .set('Authorization', `Bearer ${GOOD_TOKEN}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(PRINCIPAL);
    });

    it.each([
      ['no header', undefined],
      ['a wrong token', 'Bearer nope'],
      ['another scheme', 'Basic abc'],
    ])('answers 401 UNAUTHORIZED for %s', async (_title, header) => {
      const call = http().get('/test/private');
      const response = await (header === undefined
        ? call
        : call.set('Authorization', header));

      expect(response.status).toBe(401);
      expect(problemOf(response).code).toBe('UNAUTHORIZED');
    });
  });
});
