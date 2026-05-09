import { estimateCost, formatCost } from './pricing.js';

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

export type RunMetadata = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  runtimeMs: number;
};

export function renderRunFooter(opts: RunMetadata): string {
  const tokens = `${formatTokens(opts.inputTokens)} in / ${formatTokens(opts.outputTokens)} out`;
  const runtime = `${(opts.runtimeMs / 1000).toFixed(1)}s`;
  const cost = estimateCost(opts.model, opts.inputTokens, opts.outputTokens);
  const costStr = cost !== null ? ` | cost: ~${formatCost(cost)}` : '';
  const ts = new Date().toISOString().replace('T', ' ').replace(/\..+/, ' UTC');
  return `\n\n---\nRun: ${ts} | model: ${opts.model} | tokens: ${tokens}${costStr} | runtime: ${runtime}`;
}

export function renderRunDetailsBlock(opts: RunMetadata): string {
  const cost = estimateCost(opts.model, opts.inputTokens, opts.outputTokens);
  const costLine = cost !== null ? `- Estimated cost: ~${formatCost(cost)}` : '- Estimated cost: unknown (pricing not in table)';
  return [
    '## Run details',
    '',
    `- Model: \`${opts.model}\``,
    `- Input tokens: ${opts.inputTokens.toLocaleString()}`,
    `- Output tokens: ${opts.outputTokens.toLocaleString()}`,
    costLine,
    `- Runtime: ${(opts.runtimeMs / 1000).toFixed(1)}s`,
    `- Generated: ${new Date().toISOString()}`,
  ].join('\n');
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}
