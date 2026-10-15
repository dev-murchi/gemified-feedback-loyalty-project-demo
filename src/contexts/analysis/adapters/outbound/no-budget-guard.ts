import type { BudgetGuard } from '../../application/ports/budget-guard.js';

/** The demo's budget guard (SDD 11.1): never on. The real one, with the spend ledger, comes later. */
export class NoBudgetGuard implements BudgetGuard {
  isOn(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
