import {
  isValidTckn,
  passesLuhn,
} from '../../../src/contexts/analysis/domain/masking/checksums.js';

describe('check digits (SDD 8.6)', () => {
  it('accepts a T.C. kimlik numarası only with both check digits right', () => {
    expect(isValidTckn('12345678950')).toBe(true);
    expect(isValidTckn('12345678960')).toBe(false); // wrong 10th digit
    expect(isValidTckn('12345678951')).toBe(false); // wrong 11th digit
  });

  it.each(['02345678950', '1234567895', '123456789501', '1234567895a'])(
    'rejects %s, which is not 11 digits starting with 1–9',
    (value) => {
      expect(isValidTckn(value)).toBe(false);
    },
  );

  it('applies the Luhn check to 13–19 digits only', () => {
    expect(passesLuhn('4111111111111111')).toBe(true);
    expect(passesLuhn('4111111111111112')).toBe(false);
    expect(passesLuhn('411111111111')).toBe(false); // 12 digits
    expect(passesLuhn('41111111111111111111')).toBe(false); // 20 digits
    expect(passesLuhn('4111 1111 1111 1111')).toBe(false); // separators are removed by the caller
  });
});
