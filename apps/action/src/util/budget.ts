import type { Usage } from './pricing.js';

export class TokenBudget {
  private inputUsed = 0;
  private outputUsed = 0;
  private cacheCreation = 0;
  private cacheRead = 0;

  constructor(
    private readonly maxInput: number,
    private readonly maxOutput: number,
  ) {}

  record(input: number | Usage, output?: number): void {
    if (typeof input === 'number') {
      this.inputUsed += input;
      this.outputUsed += output ?? 0;
      return;
    }
    this.inputUsed += input.inputTokens;
    this.outputUsed += input.outputTokens;
    this.cacheCreation += input.cacheCreationTokens ?? 0;
    this.cacheRead += input.cacheReadTokens ?? 0;
  }

  // Cache writes cost 1.25x input rate; cache reads cost 0.1x. Weighting them
  // here keeps the budget cap aligned with real spend rather than raw token
  // volume, so multi-turn agents with heavy caching stay productive within
  // the cap instead of getting cut off prematurely.
  private effectiveInput(): number {
    return this.inputUsed + this.cacheCreation * 1.25 + this.cacheRead * 0.1;
  }

  exhausted(): boolean {
    return this.effectiveInput() >= this.maxInput || this.outputUsed >= this.maxOutput;
  }

  remaining(): { input: number; output: number } {
    return {
      input: Math.max(0, this.maxInput - this.effectiveInput()),
      output: Math.max(0, this.maxOutput - this.outputUsed),
    };
  }

  used(): Usage {
    return {
      inputTokens: this.inputUsed,
      outputTokens: this.outputUsed,
      cacheCreationTokens: this.cacheCreation,
      cacheReadTokens: this.cacheRead,
    };
  }
}
