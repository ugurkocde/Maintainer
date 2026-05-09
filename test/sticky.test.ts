import { describe, it, expect } from 'vitest';
import {
  findStickyComment,
  withStickyMarker,
  stickyMarker,
  renderRunFooter,
  renderRunDetailsBlock,
} from '../src/util/sticky.js';

describe('sticky comments', () => {
  it('finds sticky by marker', () => {
    const comments = [{ body: 'unrelated' }, { body: `${stickyMarker('triage')}\nhello` }];
    const found = findStickyComment(comments, 'triage');
    expect(found?.body).toContain(stickyMarker('triage'));
  });

  it('returns undefined when no sticky present', () => {
    expect(findStickyComment([{ body: 'a' }, { body: 'b' }], 'fix')).toBeUndefined();
  });

  it('wraps body with marker', () => {
    const wrapped = withStickyMarker('triage', 'hello');
    expect(wrapped.startsWith(stickyMarker('triage'))).toBe(true);
    expect(wrapped).toContain('hello');
  });

  it('renders run footer with cost', () => {
    const footer = renderRunFooter({
      model: 'claude-sonnet-4-6',
      usage: { inputTokens: 100_000, outputTokens: 10_000 },
      runtimeMs: 12345,
    });
    expect(footer).toContain('claude-sonnet-4-6');
    expect(footer).toContain('100.0k');
    expect(footer).toContain('12.3s');
    expect(footer).toContain('cost: ~$0.45');
  });

  it('omits cost field for unknown model', () => {
    const footer = renderRunFooter({
      model: 'claude-banana-9-9',
      usage: { inputTokens: 1000, outputTokens: 500 },
      runtimeMs: 1000,
    });
    expect(footer).not.toContain('cost:');
  });

  it('shows cache breakdown in footer when present', () => {
    const footer = renderRunFooter({
      model: 'claude-sonnet-4-6',
      usage: {
        inputTokens: 1000,
        outputTokens: 200,
        cacheCreationTokens: 500,
        cacheReadTokens: 2000,
      },
      runtimeMs: 1000,
    });
    expect(footer).toContain('cache write');
    expect(footer).toContain('cache read');
  });

  it('renders run details block for PR body', () => {
    const md = renderRunDetailsBlock({
      model: 'claude-opus-4-7',
      usage: { inputTokens: 100_000, outputTokens: 10_000 },
      runtimeMs: 60_000,
    });
    expect(md).toContain('## Run details');
    expect(md).toContain('claude-opus-4-7');
    expect(md).toContain('100,000');
    expect(md).toContain('Estimated cost: ~$2.25');
    expect(md).toContain('60.0s');
  });

  it('shows cache lines in run details only when non-zero', () => {
    const noCache = renderRunDetailsBlock({
      model: 'claude-sonnet-4-6',
      usage: { inputTokens: 100, outputTokens: 50 },
      runtimeMs: 1000,
    });
    expect(noCache).not.toContain('Cache write');
    expect(noCache).not.toContain('Cache read');

    const withCache = renderRunDetailsBlock({
      model: 'claude-sonnet-4-6',
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationTokens: 1000,
        cacheReadTokens: 2000,
      },
      runtimeMs: 1000,
    });
    expect(withCache).toContain('Cache write tokens: 1,000');
    expect(withCache).toContain('Cache read tokens: 2,000');
    expect(withCache).toContain('1.25x');
    expect(withCache).toContain('0.1x');
  });
});
