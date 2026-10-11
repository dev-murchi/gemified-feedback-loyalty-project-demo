export type Environment = Readonly<Record<string, string | undefined>>;

/**
 * Demo data is public (it is in git), so it is loaded only when DEMO_DATA=true, and the
 * application refuses to start if that is combined with NODE_ENV=production.
 */
export function isDemoDataEnabled(env: Environment): boolean {
  const requested = env['DEMO_DATA'] === 'true';
  if (requested && env['NODE_ENV'] === 'production') {
    throw new Error('DEMO_DATA=true is not allowed when NODE_ENV=production');
  }
  return requested;
}
