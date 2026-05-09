import { estimateCost, formatCost, type Usage } from './pricing.js';

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
  usage: Usage;
  runtimeMs: number;
};

export function renderRunFooter(opts: RunMetadata): string {
  const tokens = formatTokenSummary(opts.usage);
  const runtime = `${(opts.runtimeMs / 1000).toFixed(1)}s`;
  const cost = estimateCost(opts.model, opts.usage);
  const costStr = cost !== null ? ` | cost: ~${formatCost(cost)}` : '';
  const ts = new Date().toISOString().replace('T', ' ').replace(/\..+/, ' UTC');
  return `\n\n---\nRun: ${ts} | model: ${opts.model} | tokens: ${tokens}${costStr} | runtime: ${runtime}`;
}

export function renderRunDetailsBlock(opts: RunMetadata): string {
  const cost = estimateCost(opts.model, opts.usage);
  const costLine =
    cost !== null
      ? `- Estimated cost: ~${formatCost(cost)}`
      : '- Estimated cost: unknown (pricing not in table)';
  const cacheCreation = opts.usage.cacheCreationTokens ?? 0;
  const cacheRead = opts.usage.cacheReadTokens ?? 0;
  const cacheLines: string[] = [];
  if (cacheCreation > 0) cacheLines.push(`- Cache write tokens: ${cacheCreation.toLocaleString()} (billed at 1.25x)`);
  if (cacheRead > 0) cacheLines.push(`- Cache read tokens: ${cacheRead.toLocaleString()} (billed at 0.1x)`);

  return [
    '## Run details',
    '',
    `- Model: \`${opts.model}\``,
    `- Input tokens: ${opts.usage.inputTokens.toLocaleString()}`,
    `- Output tokens: ${opts.usage.outputTokens.toLocaleString()}`,
    ...cacheLines,
    costLine,
    `- Runtime: ${(opts.runtimeMs / 1000).toFixed(1)}s`,
    `- Generated: ${new Date().toISOString()}`,
  ].join('\n');
}

function formatTokenSummary(usage: Usage): string {
  const parts: string[] = [];
  parts.push(`${formatTokens(usage.inputTokens)} in`);
  if (usage.cacheCreationTokens && usage.cacheCreationTokens > 0) {
    parts.push(`${formatTokens(usage.cacheCreationTokens)} cache write`);
  }
  if (usage.cacheReadTokens && usage.cacheReadTokens > 0) {
    parts.push(`${formatTokens(usage.cacheReadTokens)} cache read`);
  }
  parts.push(`${formatTokens(usage.outputTokens)} out`);
  return parts.join(' / ');
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}
