import { describe, it, expect } from 'vitest';
import { findStickyComment, withStickyMarker, stickyMarker, renderRunFooter } from '../src/util/sticky.js';

describe('sticky comments', () => {
  it('finds sticky by marker', () => {
    const comments = [
      { body: 'unrelated' },
      { body: `${stickyMarker('triage')}\nhello` },
    ];
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

  it('renders run footer', () => {
    const footer = renderRunFooter({
      model: 'claude-sonnet-4-6',
      inputTokens: 1234,
      outputTokens: 567,
      runtimeMs: 12345,
    });
    expect(footer).toContain('claude-sonnet-4-6');
    expect(footer).toContain('1.2k');
    expect(footer).toContain('12.3s');
  });
});
