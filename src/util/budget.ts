export class TokenBudget {
  private inputUsed = 0;
  private outputUsed = 0;

  constructor(
    private readonly maxInput: number,
    private readonly maxOutput: number,
  ) {}

  record(input: number, output: number): void {
    this.inputUsed += input;
    this.outputUsed += output;
  }

  exhausted(): boolean {
    return this.inputUsed >= this.maxInput || this.outputUsed >= this.maxOutput;
  }

  remaining(): { input: number; output: number } {
    return {
      input: Math.max(0, this.maxInput - this.inputUsed),
      output: Math.max(0, this.maxOutput - this.outputUsed),
    };
  }

  used(): { input: number; output: number } {
    return { input: this.inputUsed, output: this.outputUsed };
  }
}
