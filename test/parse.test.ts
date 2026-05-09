import { describe, it, expect } from 'vitest';
import { parseCommand } from '../src/commands/parse.js';

describe('parseCommand', () => {
  it('parses a slash command with no args', () => {
    expect(parseCommand('/maintainer fix')).toEqual({ kind: 'slash', command: 'fix', args: '' });
  });

  it('parses a slash command with args', () => {
    expect(parseCommand('/maintainer fix in src/foo.ts')).toEqual({
      kind: 'slash',
      command: 'fix',
      args: 'in src/foo.ts',
    });
  });

  it('parses an @mention with instruction', () => {
    const r = parseCommand('@maintainer please look at this');
    expect(r.kind).toBe('mention');
  });

  it('returns none for unrelated comments', () => {
    expect(parseCommand('thanks for the report!')).toEqual({ kind: 'none' });
  });

  it('returns none for empty string', () => {
    expect(parseCommand('')).toEqual({ kind: 'none' });
  });

  it('does not match @maintainer-foo', () => {
    expect(parseCommand('@maintainer-foo bar')).toEqual({ kind: 'none' });
  });

  it('matches @maintainer when at start of comment', () => {
    const r = parseCommand('@maintainer fix this');
    expect(r.kind).toBe('mention');
  });

  it('prefers slash command over mention when both present', () => {
    const r = parseCommand('/maintainer fix\n\nalso @maintainer please');
    expect(r.kind).toBe('slash');
    if (r.kind === 'slash') {
      expect(r.command).toBe('fix');
    }
  });

  it('is case-insensitive on slash command', () => {
    expect(parseCommand('/Maintainer Fix').kind).toBe('slash');
  });
});
