import { isDemoDataEnabled } from '../../../src/composition/demo-data.js';

describe('isDemoDataEnabled', () => {
  it('is off unless DEMO_DATA=true', () => {
    // Given no demo flag
    // When the setting is read
    // Then demo data is not loaded
    expect(isDemoDataEnabled({ NODE_ENV: 'development' })).toBe(false);
  });

  it('is on with DEMO_DATA=true outside production', () => {
    // Given the demo flag in development
    // When the setting is read
    // Then demo data is loaded
    expect(
      isDemoDataEnabled({ DEMO_DATA: 'true', NODE_ENV: 'development' }),
    ).toBe(true);
  });

  it('refuses DEMO_DATA=true when NODE_ENV=production', () => {
    // Given the demo flag in production
    // When the setting is read
    const read = () =>
      isDemoDataEnabled({ DEMO_DATA: 'true', NODE_ENV: 'production' });

    // Then it refuses
    expect(read).toThrow();
  });
});
