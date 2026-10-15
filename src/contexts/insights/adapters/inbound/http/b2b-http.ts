import type { ClientPrincipal } from '../../../../../platform/http/client-auth.guard.js';
import { ProblemException } from '../../../../../platform/http/problem-exception.js';
import type { DomainError } from '../../../../../shared-kernel/domain-error.js';
import { BrandId } from '../../../../../shared-kernel/ids.js';
import type { Result } from '../../../../../shared-kernel/result.js';

/** A use case's business outcome becomes its value, or a Problem Details response. */
export const valueOf = <T>(result: Result<T, DomainError>): T => {
  if (!result.ok) throw ProblemException.from(result.error);
  return result.value;
};

/** The brand comes from the verified token only, never from the request (FR-B2B-08). */
export const brandOf = (client: ClientPrincipal): BrandId => {
  const brand = BrandId.create(client.brandId);
  if (!brand.ok)
    throw new Error('Authenticated client has an invalid brand id');
  return brand.value;
};
