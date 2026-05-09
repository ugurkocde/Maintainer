export type ParsedCommand =
  | { kind: 'slash'; command: string; args: string }
  | { kind: 'mention'; instruction: string }
  | { kind: 'none' };

const MENTION_RE = /(^|[^a-z0-9_])@maintainer(?![a-z0-9_-])/i;
const SLASH_RE = /^\s*\/maintainer\s+(\S+)(?:\s+([\s\S]*))?/i;

export function parseCommand(commentBody: string): ParsedCommand {
  if (!commentBody) return { kind: 'none' };

  const slash = commentBody.match(SLASH_RE);
  if (slash) {
    return { kind: 'slash', command: slash[1].toLowerCase(), args: (slash[2] ?? '').trim() };
  }

  if (MENTION_RE.test(commentBody)) {
    return { kind: 'mention', instruction: commentBody.trim() };
  }

  return { kind: 'none' };
}
