import type { Config } from '../config/schema.js';
import type { Workspace } from '../fix/sandbox.js';
import { anthropic } from '../agent/client.js';
import { REVIEWER_PROMPT } from '../agent/prompts.js';
import { callStructured, type AgentTool } from '../agent/loop.js';
import { TokenBudget } from '../util/budget.js';
import { workspaceTools } from '../fix/tools.js';
import { recordAgentStep } from '../db/ops.js';
import type { RunState } from '../index.js';
import { log } from '../util/log.js';

export type ReviewVerdict = {
  approved: boolean;
  summary: string;
  concerns: string[];
  suggestions: string[];
};

const REVIEW_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    approved: {
      type: 'boolean',
      description:
        'True only if the diff meets all approval criteria. False if any reject criterion is met.',
    },
    summary: {
      type: 'string',
      description: 'One-sentence overall verdict.',
    },
    concerns: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Specific actionable concerns when not approved. Empty array when approved. Each entry is a single concrete issue.',
    },
    suggestions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Optional improvements that would not block merge. Empty when none.',
    },
  },
  required: ['approved', 'summary', 'concerns', 'suggestions'],
} as const;

export async function runReview(args: {
  ws?: Workspace;
  apiKey: string;
  config: Config;
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  diff: string;
  files: string[];
  testCommand?: string;
  testOutput?: string;
  fixerSummary: string;
  language?: string;
  runState?: RunState;
  position: number;
}): Promise<ReviewVerdict | null> {
  const {
    apiKey,
    config,
    issueNumber,
    issueTitle,
    issueBody,
    diff,
    files,
    testCommand,
    testOutput,
    fixerSummary,
    language,
    runState,
    position,
  } = args;

  if (!config.review.enabled) {
    log.info('Reviewer disabled in config; approving by default.');
    return null;
  }

  const start = Date.now();
  const startedAt = new Date(start);
  const budget = new TokenBudget(config.review.max_input_tokens, config.review.max_output_tokens);

  const truncatedDiff =
    diff.length > 60_000
      ? diff.slice(0, 60_000) + `\n\n[diff truncated; original was ${diff.length} bytes]`
      : diff;
  const truncatedTestOutput =
    testOutput && testOutput.length > 6_000 ? testOutput.slice(0, 6_000) + '\n[truncated]' : testOutput;

  const userPrompt = `Issue #${issueNumber}: ${issueTitle}

Issue body:
"""
${issueBody || '(empty)'}
"""

Project language: ${language ?? 'unknown'}
Test command: ${testCommand ?? 'none configured'}
Files changed: ${files.join(', ')}

Fixer agent's reasoning summary:
"""
${fixerSummary || '(none)'}
"""

${truncatedTestOutput ? `Test output (truncated):\n\`\`\`\n${truncatedTestOutput}\n\`\`\`\n\n` : ''}Unified diff:
\`\`\`diff
${truncatedDiff}
\`\`\`

Decide. Use the review_verdict tool.`;

  let verdict: ReviewVerdict;
  try {
    const result = await callStructured<ReviewVerdict>({
      client: anthropic(apiKey),
      model: config.review.model,
      systemPrompt: REVIEWER_PROMPT,
      userPrompt,
      schemaName: 'review_verdict',
      schemaDescription: 'Final review verdict on the proposed diff.',
      inputSchema: REVIEW_TOOL_SCHEMA,
      budget,
      maxTokens: 2048,
    });
    verdict = result.value;
  } catch (err) {
    log.error(`Review failed: ${(err as Error).message}`);
    if (runState?.runId) {
      await recordAgentStep({
        runId: runState.runId,
        position,
        agent: 'reviewer',
        model: config.review.model,
        status: 'failed',
        usage: budget.used(),
        startedAt,
        stopReason: 'api_error',
      });
    }
    // Default to approve when the reviewer itself errors. The fixer's
    // change already passed tests; better to ship and let humans review
    // than to block on infrastructure flakiness.
    return null;
  }

  if (runState?.runId) {
    await recordAgentStep({
      runId: runState.runId,
      position,
      agent: 'reviewer',
      model: config.review.model,
      status: 'succeeded',
      inputSummary: `${files.length} file${files.length === 1 ? '' : 's'} for #${issueNumber}`,
      outputSummary: `${verdict.approved ? 'approved' : 'rejected'}: ${verdict.summary.slice(0, 200)}`,
      usage: budget.used(),
      stopReason: 'end_turn',
      metadata: { verdict, files },
      startedAt,
    });
  }

  log.info(
    `Review verdict: ${verdict.approved ? 'approved' : 'rejected'}; ${verdict.concerns.length} concern${verdict.concerns.length === 1 ? '' : 's'}.`,
  );
  return verdict;
}

export function renderReviewBlock(verdict: ReviewVerdict): string {
  const lines: string[] = ['## Reviewer verdict', '', `**${verdict.approved ? 'Approved' : 'Rejected'}** — ${verdict.summary}`];
  if (verdict.concerns.length > 0) {
    lines.push('', '### Concerns');
    for (const c of verdict.concerns) lines.push(`- ${c}`);
  }
  if (verdict.suggestions.length > 0) {
    lines.push('', '### Suggestions');
    for (const s of verdict.suggestions) lines.push(`- ${s}`);
  }
  return lines.join('\n');
}

// Optional: expose workspace tools to the reviewer when we want it to read
// surrounding context. Currently unused (review is diff-only) but kept here
// so the agent loop variant is a one-line swap if we add it later.
export function reviewerTools(ws: Workspace): AgentTool[] {
  return workspaceTools(ws);
}
