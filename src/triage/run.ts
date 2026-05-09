import type { Octokit } from '../github/client.js';
import type { Config } from '../config/schema.js';
import type { ParsedIssuesEvent } from '../util/events.js';
import { anthropic } from '../agent/client.js';
import { TRIAGE_PROMPT } from '../agent/prompts.js';
import { callStructured } from '../agent/loop.js';
import { TokenBudget } from '../util/budget.js';
import { renderRunFooter } from '../util/sticky.js';
import { upsertStickyComment, reactToIssue } from '../github/issues.js';
import { addLabels } from '../github/labels.js';
import { findCandidateDuplicates } from '../github/search.js';
import { log } from '../util/log.js';

export type TriageVerdict = {
  type: 'bug' | 'feature' | 'question' | 'support' | 'spam' | 'not_actionable';
  severity: 'critical' | 'high' | 'medium' | 'low';
  scope: 'scoped' | 'multi-file' | 'architectural' | 'not-actionable';
  reproducible: 'yes' | 'no' | 'partial';
  duplicates: number[];
  summary: string;
  next_action: string;
  fixable: boolean;
};

const TRIAGE_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['bug', 'feature', 'question', 'support', 'spam', 'not_actionable'],
      description: 'Issue classification.',
    },
    severity: {
      type: 'string',
      enum: ['critical', 'high', 'medium', 'low'],
      description: 'Severity tier.',
    },
    scope: {
      type: 'string',
      enum: ['scoped', 'multi-file', 'architectural', 'not-actionable'],
      description: 'Estimated fix scope.',
    },
    reproducible: {
      type: 'string',
      enum: ['yes', 'no', 'partial'],
      description: 'Whether the report includes clear reproduction steps.',
    },
    duplicates: {
      type: 'array',
      items: { type: 'integer' },
      description: 'Issue numbers of likely duplicates from the candidate list. Empty if none.',
    },
    summary: {
      type: 'string',
      description: 'Short neutral summary of what is being reported.',
    },
    next_action: {
      type: 'string',
      description: 'Recommended next concrete action in one sentence.',
    },
    fixable: {
      type: 'boolean',
      description: 'True only if scope is scoped, type is bug, and reproducible is yes.',
    },
  },
  required: ['type', 'severity', 'scope', 'reproducible', 'duplicates', 'summary', 'next_action', 'fixable'],
} as const;

export async function runTriage(args: {
  client: Octokit;
  apiKey: string;
  config: Config;
  event: ParsedIssuesEvent;
}): Promise<TriageVerdict | undefined> {
  const { client, apiKey, config, event } = args;
  const start = Date.now();
  const budget = new TokenBudget(50_000, 4_000);

  await reactToIssue(client, event.issue_number, 'eyes');

  const candidates = config.triage.auto_dedupe
    ? await findCandidateDuplicates(client, event.issue_number, event.title, event.body)
    : [];

  const candidateBlock = candidates.length
    ? candidates
        .map(
          (c) =>
            `- #${c.number} [${c.state}] ${c.title}\n  ${c.body_excerpt.replace(/\n/g, ' ').slice(0, 200)}`,
        )
        .join('\n')
    : 'none';

  const userPrompt = `Repository: ${process.env.GITHUB_REPOSITORY ?? 'unknown'}
Issue #${event.issue_number}
Title: ${event.title}
Author: @${event.author}
Existing labels: ${event.labels.join(', ') || 'none'}

Body:
"""
${event.body || '(empty)'}
"""

Candidate possible duplicates (from search; you decide which, if any, are real duplicates):
${candidateBlock}`;

  let verdict: TriageVerdict;
  try {
    const result = await callStructured<TriageVerdict>({
      client: anthropic(apiKey),
      model: config.triage.model,
      systemPrompt: TRIAGE_PROMPT,
      userPrompt,
      schemaName: 'triage_verdict',
      schemaDescription: 'Final triage verdict for this issue.',
      inputSchema: TRIAGE_TOOL_SCHEMA,
      budget,
      maxTokens: 1500,
    });
    verdict = result.value;
  } catch (err) {
    log.error(`Triage failed: ${(err as Error).message}`);
    return undefined;
  }

  if (config.triage.auto_label) {
    await applyTriageLabels(client, event.issue_number, verdict, config);
  }

  const body = renderTriageBody(verdict, candidates);
  const footer = renderRunFooter({
    model: config.triage.model,
    usage: budget.used(),
    runtimeMs: Date.now() - start,
  });
  await upsertStickyComment(client, event.issue_number, 'triage', body + footer);

  log.info(
    `Triage complete: type=${verdict.type} severity=${verdict.severity} scope=${verdict.scope} fixable=${verdict.fixable}`,
  );
  return verdict;
}

function renderTriageBody(v: TriageVerdict, candidates: { number: number; title: string; url: string }[]): string {
  const dupLines = v.duplicates.length
    ? v.duplicates
        .map((n) => {
          const hit = candidates.find((c) => c.number === n);
          return hit ? `- [#${n}](${hit.url}) ${hit.title}` : `- #${n}`;
        })
        .join('\n')
    : '_none_';

  return `### Maintainer triage

- **Type:** ${v.type}
- **Severity:** ${v.severity}
- **Scope:** ${v.scope}
- **Reproducible:** ${v.reproducible}
- **Fixable by Maintainer:** ${v.fixable ? 'yes' : 'no'}

**Summary**
${v.summary}

**Possible duplicates**
${dupLines}

**Suggested next action**
${v.next_action}`;
}

async function applyTriageLabels(
  client: Octokit,
  issueNumber: number,
  v: TriageVerdict,
  config: Config,
): Promise<void> {
  const labels: string[] = [];
  const prefix = config.labels.prefix;

  switch (v.type) {
    case 'bug':
      labels.push(`${prefix}bug`);
      break;
    case 'feature':
      labels.push(`${prefix}feature`);
      break;
    case 'question':
    case 'support':
      labels.push(`${prefix}question`);
      break;
  }

  labels.push(`${prefix}severity-${v.severity}`);

  if (v.reproducible === 'no' && v.type === 'bug') labels.push(`${prefix}needs-repro`);
  if (v.duplicates.length > 0) labels.push(`${prefix}duplicate`);
  if (v.scope === 'architectural' || v.scope === 'not-actionable') labels.push(`${prefix}needs-human`);

  if (labels.length > 0) await addLabels(client, issueNumber, labels);
}
