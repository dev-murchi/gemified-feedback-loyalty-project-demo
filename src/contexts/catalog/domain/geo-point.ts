import type { DomainError } from '../../../shared-kernel/domain-error.js';
import { err, ok, type Result } from '../../../shared-kernel/result.js';

/** A branch location in degrees; used for the B2B heat map (FR-B2B-05). */
export interface GeoPoint {
  readonly lat: number;
  readonly lng: number;
}

export interface InvalidGeoPoint extends DomainError<'VALIDATION_ERROR'> {
  readonly field: 'location';
}

const within = (value: number, limit: number): boolean =>
  Number.isFinite(value) && Math.abs(value) <= limit;

export const GeoPoint = {
  create(lat: number, lng: number): Result<GeoPoint, InvalidGeoPoint> {
    return within(lat, 90) && within(lng, 180)
      ? ok({ lat, lng })
      : err({ code: 'VALIDATION_ERROR', field: 'location' });
  },
};
