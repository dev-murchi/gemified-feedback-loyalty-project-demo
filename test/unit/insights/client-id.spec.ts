import { ClientId } from '../../../src/contexts/insights/domain/b2b-client/client-id.js';

describe('ClientId (docs/06 §5.6)', () => {
  it.each(['fuel-panel', 'brand-a-panel', 'abc', 'a1.b_c-d', 'x'.repeat(64)])(
    'accepts %s',
    (raw) => {
      expect(ClientId.parse(raw)).toBe(raw);
    },
  );

  it.each([
    '',
    'ab',
    'Fuel-Panel',
    '-panel',
    'fuel panel',
    'fuel/panel',
    'x'.repeat(65),
  ])('refuses %j', (raw) => {
    expect(ClientId.parse(raw)).toBeUndefined();
  });
});
