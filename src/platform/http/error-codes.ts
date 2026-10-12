/**
 * The one table from error code to HTTP status (docs/07 §6). Every domain error code reaches the
 * client through it, and a test keeps it equal to the error catalog and the `ErrorCode` enum in
 * docs/api/openapi.yaml. 429 is only for RATE_LIMITED; business rejections are 422 (never 429,
 * because HTTP clients retry 429 on their own).
 */
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  CHALLENGE_INVALID: 401,
  SIGNATURE_INVALID: 401,
  KEY_REVOKED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  FEEDBACK_PENDING: 409,
  PAYLOAD_TOO_LARGE: 413,
  QR_INVALID: 422,
  TEXT_TOO_SHORT: 422,
  TEXT_TOO_LONG: 422,
  IDEMPOTENCY_KEY_MISMATCH: 422,
  REWARD_COOLDOWN: 422,
  ATTEMPTS_EXHAUSTED: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

/**
 * The fixed, developer-facing `title` of each code (Problem Details). There is no user-facing
 * message: the app localizes by `code`.
 */
export const ERROR_TITLE: Readonly<Record<ErrorCode, string>> = {
  VALIDATION_ERROR: 'İstek biçimi hatalı',
  UNAUTHORIZED: 'Erişim token’ı eksik, geçersiz veya süresi dolmuş',
  CHALLENGE_INVALID: 'Nonce geçersiz, süresi dolmuş veya daha önce kullanılmış',
  SIGNATURE_INVALID: 'Anahtar sahipliği kanıtı (imza) doğrulanamadı',
  KEY_REVOKED: 'Cihaz anahtarı iptal edilmiş',
  FORBIDDEN: 'Token’ın kapsamı yetersiz',
  NOT_FOUND: 'Kaynak yok veya isteyene ait değil',
  FEEDBACK_PENDING: 'Bu şubedeki önceki yorum hâlâ inceleniyor',
  PAYLOAD_TOO_LARGE: 'İstek gövdesi 8 KB’den büyük',
  QR_INVALID: 'QR token’ı bilinmiyor, iptal edilmiş veya biçimi bozuk',
  TEXT_TOO_SHORT: 'Yorum 20 karakterden kısa',
  TEXT_TOO_LONG: 'Yorum 1.000 karakterden uzun',
  IDEMPOTENCY_KEY_MISMATCH:
    'Aynı Idempotency-Key farklı bir gövdeyle kullanıldı',
  REWARD_COOLDOWN: 'Bu şubede 24 saatlik ödül bekleme süresi dolmadı',
  ATTEMPTS_EXHAUSTED: 'Bu şubede son 24 saatte 3 yorum gönderildi',
  RATE_LIMITED: 'Teknik hız sınırı aşıldı',
  INTERNAL_ERROR: 'Beklenmeyen sunucu hatası',
};

export const isErrorCode = (code: string): code is ErrorCode =>
  Object.hasOwn(ERROR_STATUS, code);
