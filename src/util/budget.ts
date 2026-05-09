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

  exhausted(): boolean {
    const inputTotal = this.inputUsed + this.cacheCreation + this.cacheRead;
    return inputTotal >= this.maxInput || this.outputUsed >= this.maxOutput;
  }

  remaining(): { input: number; output: number } {
    const inputTotal = this.inputUsed + this.cacheCreation + this.cacheRead;
    return {
      input: Math.max(0, this.maxInput - inputTotal),
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
