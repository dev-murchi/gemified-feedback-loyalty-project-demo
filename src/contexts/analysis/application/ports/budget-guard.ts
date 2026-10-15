/**
 * Is the monthly LLM budget used up (FR-AI-12, SDD 8.5)? While it is, new analyses wait and a
 * 24-hour close earns no reward. The demo has no budget guard (SDD 11.1): it is always off.
 */
export interface BudgetGuard {
  isOn(): Promise<boolean>;
}
