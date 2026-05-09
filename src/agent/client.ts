import Anthropic from '@anthropic-ai/sdk';

let cached: Anthropic | undefined;

export function anthropic(apiKey: string): Anthropic {
  if (!cached) cached = new Anthropic({ apiKey });
  return cached;
}

export const MODELS = {
  triage: 'claude-sonnet-4-6',
  fix: 'claude-opus-4-7',
  intent: 'claude-sonnet-4-6',
} as const;
