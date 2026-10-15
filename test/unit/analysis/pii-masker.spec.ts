import { PiiMasker } from '../../../src/contexts/analysis/domain/masking/pii-masker.js';

const mask = (text: string) => new PiiMasker().mask(text);

/** A T.C. kimlik numarası with correct check digits, and the same with a wrong last digit. */
const VALID_TCKN = '12345678950';
const INVALID_TCKN = '12345678951';

describe('PiiMasker (FR-AI-07, SDD 8.6)', () => {
  describe('phone numbers (TC-AI-06)', () => {
    it.each([
      '0532 123 45 67',
      '05321234567',
      '5321234567',
      '+90 532 123 45 67',
      '0090 532 123 45 67',
      '+90 (212) 123-45-67',
      '0 (216) 123 45 67',
    ])('masks %s', (phone) => {
      expect(mask(`Beni ${phone} numarasından arayın.`)).toBe(
        'Beni [TELEFON] numarasından arayın.',
      );
    });
  });

  it.each([
    ['ali.veli@example.com', '[EPOSTA]'],
    ['musteri+sikayet@mail.co.uk', '[EPOSTA]'],
  ])('masks the e-mail address %s (TC-AI-06)', (email, placeholder) => {
    expect(mask(`Adresim ${email} olur.`)).toBe(`Adresim ${placeholder} olur.`);
  });

  it.each(['34 ABC 123', '06A1234', '81 AB 12'])(
    'masks the plate %s (TC-AI-06)',
    (plate) => {
      expect(mask(`Önümdeki ${plate} plakalı araç`)).toBe(
        'Önümdeki [PLAKA] plakalı araç',
      );
    },
  );

  it('does not take an il code outside 01–81 for a plate', () => {
    expect(mask('Pompa 82 ABC 123 gibi bir şey yazıyordu')).toBe(
      'Pompa 82 ABC 123 gibi bir şey yazıyordu',
    );
  });

  describe('T.C. kimlik numarası (TC-AI-09)', () => {
    it('masks a number with correct check digits', () => {
      expect(mask(`Kimlik numaram ${VALID_TCKN}.`)).toBe(
        'Kimlik numaram [TCKN].',
      );
    });

    it('leaves an 11-digit number with wrong check digits, such as an order number', () => {
      expect(mask(`Sipariş numaram ${INVALID_TCKN}.`)).toBe(
        `Sipariş numaram ${INVALID_TCKN}.`,
      );
    });

    it('never masks an 11-digit number starting with 0 as a TCKN', () => {
      expect(mask('Fiş no 01234567890 idi')).not.toContain('[TCKN]');
    });
  });

  it.each(['TR33 0006 1005 1978 6457 8413 26', 'TR330006100519786457841326'])(
    'masks the IBAN %s',
    (iban) => {
      expect(mask(`IBAN: ${iban} iade için`)).toBe('IBAN: [IBAN] iade için');
    },
  );

  describe('card numbers', () => {
    it.each(['4111 1111 1111 1111', '4111-1111-1111-1111', '4111111111111111'])(
      'masks %s, which passes the Luhn check',
      (card) => {
        expect(mask(`Kartım ${card} çekildi`)).toBe('Kartım [KART] çekildi');
      },
    );

    it('leaves a 16-digit number that fails the Luhn check', () => {
      expect(mask('Fiş no 4111 1111 1111 1112')).not.toContain('[KART]');
    });
  });

  it('masks several kinds in one comment and keeps everything else', () => {
    expect(
      mask(
        `Personel kabaydı. ${VALID_TCKN} ve 0532 123 45 67, mail ali@ornek.com`,
      ),
    ).toBe('Personel kabaydı. [TCKN] ve [TELEFON], mail [EPOSTA]');
  });

  it('leaves names: they are not masked in the MVP (TZ-8, SRS CR-007)', () => {
    expect(mask('Kasiyer Ahmet Yılmaz çok kabaydı')).toBe(
      'Kasiyer Ahmet Yılmaz çok kabaydı',
    );
  });

  it('leaves a comment without personal data unchanged', () => {
    const text =
      'Tuvaletler çok kirliydi, 3 kez söyledim ama 20 dakika bekledim.';
    expect(mask(text)).toBe(text);
  });
});
