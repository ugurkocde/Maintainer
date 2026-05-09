type Pricing = { inputPerM: number; outputPerM: number };

const PRICES: Record<string, Pricing> = {
  'claude-opus-4-7': { inputPerM: 15, outputPerM: 75 },
  'claude-sonnet-4-6': { inputPerM: 3, outputPerM: 15 },
  'claude-haiku-4-5': { inputPerM: 1, outputPerM: 5 },
  'claude-haiku-4-5-20251001': { inputPerM: 1, outputPerM: 5 },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number | null {
  const key = Object.keys(PRICES).find((k) => model === k || model.startsWith(`${k}-`));
  if (!key) return null;
  const p = PRICES[key];
  return (inputTokens * p.inputPerM + outputTokens * p.outputPerM) / 1_000_000;
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return '<$0.01';
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
