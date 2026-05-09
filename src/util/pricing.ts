export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
};

type Pricing = { inputPerM: number; outputPerM: number };

const PRICES: Record<string, Pricing> = {
  'claude-opus-4-7': { inputPerM: 15, outputPerM: 75 },
  'claude-sonnet-4-6': { inputPerM: 3, outputPerM: 15 },
  'claude-haiku-4-5': { inputPerM: 1, outputPerM: 5 },
  'claude-haiku-4-5-20251001': { inputPerM: 1, outputPerM: 5 },
};

const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

export function estimateCost(model: string, usage: Usage): number | null {
  const key = Object.keys(PRICES).find((k) => model === k || model.startsWith(`${k}-`));
  if (!key) return null;
  const p = PRICES[key];
  const cacheCreation = usage.cacheCreationTokens ?? 0;
  const cacheRead = usage.cacheReadTokens ?? 0;
  const inputCost =
    (usage.inputTokens * p.inputPerM +
      cacheCreation * p.inputPerM * CACHE_WRITE_MULTIPLIER +
      cacheRead * p.inputPerM * CACHE_READ_MULTIPLIER) /
    1_000_000;
  const outputCost = (usage.outputTokens * p.outputPerM) / 1_000_000;
  return inputCost + outputCost;
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return '<$0.01';
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function totalInputTokens(usage: Usage): number {
  return usage.inputTokens + (usage.cacheCreationTokens ?? 0) + (usage.cacheReadTokens ?? 0);
}
