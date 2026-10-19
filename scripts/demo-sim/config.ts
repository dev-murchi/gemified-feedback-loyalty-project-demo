// Settings of the demo simulator (`npm run demo-sim`).

const portFrom = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const SIM_PORT = portFrom(process.env['SIM_PORT'], 3001);

/**
 * The host printed into QR links (`https://{host}/q/{token}`). The backend does not check it; the
 * real domain is a customer decision (SRS S-21, SDD TZ-16).
 */
export const QR_HOST = process.env['SIM_QR_HOST'] ?? 'qr.ornek-marka.example';
