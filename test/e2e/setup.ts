import { afterEach } from 'vitest';
import { takeViolations } from '../support/exchange-recorder.js';

// Every e2e test also tests the contract: any response of the real application that
// docs/api/openapi.yaml does not allow (shape, status, content type, headers, error code) fails the
// test that provoked it.
afterEach(() => {
  const found = takeViolations();
  if (found.length > 0)
    throw new Error(
      `Responses that do not match docs/api/openapi.yaml:\n- ${found.join('\n- ')}`,
    );
});
