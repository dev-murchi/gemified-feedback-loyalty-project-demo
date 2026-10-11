import { Brand } from '../../../src/catalog/domain/brand/brand.js';
import { GeoPoint } from '../../../src/catalog/domain/geo-point.js';
import { BRAND_ID } from '../../support/catalog-builders.js';

describe('Brand', () => {
  it('trims its name', () => {
    // Given a name with surrounding spaces
    // When a brand is created
    const result = Brand.create({
      id: BRAND_ID,
      name: '  Örnek Kahve ',
      sector: 'coffee',
    });

    // Then the name is trimmed
    expect(result.ok && result.value.name).toBe('Örnek Kahve');
  });

  it('rejects an empty name', () => {
    // Given an empty name
    // When a brand is created
    const result = Brand.create({ id: BRAND_ID, name: '', sector: 'fuel' });

    // Then it is a validation error
    expect(result.ok ? undefined : result.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GeoPoint', () => {
  it('accepts coordinates on the globe', () => {
    // Given İzmir's coordinates
    // When a point is created
    const result = GeoPoint.create(38.4237, 27.1428);

    // Then it keeps them
    expect(result).toEqual({ ok: true, value: { lat: 38.4237, lng: 27.1428 } });
  });

  it.each([
    [91, 0],
    [0, 181],
    [Number.NaN, 0],
  ])('rejects lat %d, lng %d', (lat, lng) => {
    // Given coordinates outside the globe
    // When a point is created
    const result = GeoPoint.create(lat, lng);

    // Then it is a validation error
    expect(result.ok).toBe(false);
  });
});
