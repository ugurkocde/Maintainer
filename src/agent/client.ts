import Anthropic from '@anthropic-ai/sdk';

let cached: Anthropic | undefined;

export function anthropic(apiKey: string): Anthropic {
  if (!cached) {
    cached = new Anthropic({
      apiKey,
      // SDK respects retry-after on 429 and 5xx with exponential backoff.
      // Bumping from the default 2 lets normal Tier 1/2 rate-limit spikes
      // recover without aborting the agent loop.
      maxRetries: 6,
    });
  }
  return cached;
}

export const MODELS = {
  triage: 'claude-sonnet-4-6',
  fix: 'claude-opus-4-7',
  intent: 'claude-sonnet-4-6',
} as const;
