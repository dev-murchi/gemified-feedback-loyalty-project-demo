// Check digits of the numbers the masker recognizes (SDD 8.6). Plain arithmetic, no dependencies.

const digitsOf = (value: string): number[] =>
  [...value].map((digit) => Number(digit));

const sumAt = (
  digits: readonly number[],
  positions: readonly number[],
): number =>
  positions.reduce((sum, position) => sum + (digits[position] ?? 0), 0);

/** T.C. kimlik numarası: 11 digits, first not 0; the 10th and 11th are check digits. */
export function isValidTckn(value: string): boolean {
  if (!/^[1-9]\d{10}$/.test(value)) return false;
  const d = digitsOf(value);
  const odd = sumAt(d, [0, 2, 4, 6, 8]);
  const even = sumAt(d, [1, 3, 5, 7]);
  const tenth = (((odd * 7 - even) % 10) + 10) % 10;
  const eleventh = sumAt(d, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) % 10;
  return d[9] === tenth && d[10] === eleventh;
}

/** Card numbers: 13–19 digits passing the Luhn check. */
export function passesLuhn(value: string): boolean {
  if (!/^\d{13,19}$/.test(value)) return false;
  const sum = digitsOf(value)
    .reverse()
    .reduce((total, digit, index) => {
      if (index % 2 === 0) return total + digit;
      const doubled = digit * 2;
      return total + (doubled > 9 ? doubled - 9 : doubled);
    }, 0);
  return sum % 10 === 0;
}
