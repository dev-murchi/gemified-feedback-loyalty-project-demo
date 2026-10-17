/**
 * Polls until `condition` holds; fails with `what` after `timeoutMs`. The way to wait in tests that
 * run against a real service (docs/07 §9: no fixed sleeps): wait for the event or state itself.
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  what: string,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
