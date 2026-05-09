export type StickyFlow = 'triage' | 'fix' | 'intent' | 'dashboard';

const PREFIX = '<!-- maintainer:state';

export function stickyMarker(flow: StickyFlow): string {
  return `${PREFIX}:${flow} -->`;
}

export function findStickyComment<T extends { body?: string | null }>(
  comments: T[],
  flow: StickyFlow,
): T | undefined {
  const marker = stickyMarker(flow);
  return comments.find((c) => (c.body ?? '').includes(marker));
}

export function withStickyMarker(flow: StickyFlow, body: string): string {
  return `${stickyMarker(flow)}\n${body}`;
}

export function renderRunFooter(opts: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  runtimeMs: number;
}): string {
  const tokens = `${formatTokens(opts.inputTokens)} in / ${formatTokens(opts.outputTokens)} out`;
  const runtime = `${(opts.runtimeMs / 1000).toFixed(1)}s`;
  const ts = new Date().toISOString().replace('T', ' ').replace(/\..+/, ' UTC');
  return `\n\n---\nRun: ${ts} | model: ${opts.model} | tokens: ${tokens} | runtime: ${runtime}`;
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}
