import { describe, it, expect } from 'vitest';
import { estimateCost, formatCost } from '../src/util/pricing.js';

describe('estimateCost', () => {
  it('computes Sonnet cost', () => {
    // 100k input @ $3/M = $0.30; 10k output @ $15/M = $0.15; total $0.45
    expect(estimateCost('claude-sonnet-4-6', 100_000, 10_000)).toBeCloseTo(0.45, 2);
  });

  it('computes Opus cost', () => {
    // 100k input @ $15/M = $1.50; 10k output @ $75/M = $0.75; total $2.25
    expect(estimateCost('claude-opus-4-7', 100_000, 10_000)).toBeCloseTo(2.25, 2);
  });

  it('returns null for unknown model', () => {
    expect(estimateCost('claude-banana-9-9', 100_000, 10_000)).toBeNull();
  });

  it('matches dated model variants', () => {
    expect(estimateCost('claude-haiku-4-5-20251001', 1_000_000, 100_000)).toBeCloseTo(1.5, 2);
  });
});

describe('formatCost', () => {
  it('formats sub-cent as <$0.01', () => {
    expect(formatCost(0.005)).toBe('<$0.01');
  });

  it('formats sub-dollar with three decimals', () => {
    expect(formatCost(0.123)).toBe('$0.123');
  });

  it('formats dollar amounts with two decimals', () => {
    expect(formatCost(2.345)).toBe('$2.35');
  });
});
