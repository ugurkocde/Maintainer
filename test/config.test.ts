import { describe, it, expect } from 'vitest';
import { ConfigSchema } from '../src/config/schema.js';

describe('ConfigSchema', () => {
  it('applies defaults when given empty input', () => {
    const cfg = ConfigSchema.parse({});
    expect(cfg.triage.enabled).toBe(true);
    expect(cfg.fix.enabled).toBe(true);
    expect(cfg.fix.model).toBe('claude-opus-4-7');
    expect(cfg.triage.model).toBe('claude-sonnet-4-6');
    expect(cfg.skip_label).toBe('maintainer:skip');
    expect(cfg.labels.prefix).toBe('maintainer:');
  });

  it('respects overrides', () => {
    const cfg = ConfigSchema.parse({
      fix: { enabled: false, max_input_tokens: 100_000 },
      labels: { prefix: 'bot:' },
    });
    expect(cfg.fix.enabled).toBe(false);
    expect(cfg.fix.max_input_tokens).toBe(100_000);
    expect(cfg.labels.prefix).toBe('bot:');
    expect(cfg.triage.enabled).toBe(true);
  });

  it('rejects negative budgets', () => {
    expect(() => ConfigSchema.parse({ fix: { max_input_tokens: -1 } })).toThrow();
  });

  it('caps timeout_minutes at 60', () => {
    expect(() => ConfigSchema.parse({ fix: { timeout_minutes: 120 } })).toThrow();
  });
});
