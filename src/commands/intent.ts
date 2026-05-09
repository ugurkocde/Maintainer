import type { Octokit } from '../github/client.js';
import type { Config } from '../config/schema.js';
import { anthropic } from '../agent/client.js';
import { INTENT_PROMPT } from '../agent/prompts.js';
import { runAgent, type AgentTool } from '../agent/loop.js';
import { TokenBudget } from '../util/budget.js';
import { renderRunFooter } from '../util/sticky.js';
import {
  getIssue,
  listComments,
  postComment,
  closeIssue,
  reopenIssue,
  upsertStickyComment,
} from '../github/issues.js';
import { addLabels, removeLabel } from '../github/labels.js';
import { runFix } from '../fix/run.js';
import { runTriage } from '../triage/run.js';
import { log } from '../util/log.js';

export async function runIntent(args: {
  client: Octokit;
  apiKey: string;
  config: Config;
  issueNumber: number;
  commentId: number;
  instruction: string;
  invokedBy: string;
}): Promise<void> {
  const { client, apiKey, config, issueNumber, instruction, invokedBy } = args;
  const start = Date.now();
  const budget = new TokenBudget(80_000, 8_000);

  const issue = await getIssue(client, issueNumber);
  const comments = await listComments(client, issueNumber);
  const recentComments = comments.slice(-10);

  const userPrompt = `Repository: ${process.env.GITHUB_REPOSITORY ?? 'unknown'}
Issue #${issue.number}: ${issue.title}
State: ${issue.state}
Labels: ${issue.labels.join(', ') || 'none'}
Author: @${issue.author}

Body:
"""
${issue.body || '(empty)'}
"""

Recent comments:
${recentComments.map((c) => `--- @${c.author} (${c.created_at})\n${c.body.slice(0, 1500)}`).join('\n')}

Instruction from @${invokedBy}:
"""
${instruction}
"""

Carry out the instruction using your tools. Conclude with a one-line summary in plain text.`;

  const tools: AgentTool[] = [
    {
      spec: {
        name: 'post_comment',
        description: 'Post a comment on the issue.',
        input_schema: {
          type: 'object',
          properties: { body: { type: 'string', description: 'Comment body in markdown.' } },
          required: ['body'],
        },
      },
      handler: async (input: unknown) => {
        const body = (input as { body: string }).body;
        await postComment(client, issueNumber, body);
        return 'comment posted';
      },
    },
    {
      spec: {
        name: 'apply_labels',
        description: 'Add labels to the issue.',
        input_schema: {
          type: 'object',
          properties: { labels: { type: 'array', items: { type: 'string' } } },
          required: ['labels'],
        },
      },
      handler: async (input: unknown) => {
        const { labels } = input as { labels: string[] };
        await addLabels(client, issueNumber, labels);
        return `applied ${labels.join(', ')}`;
      },
    },
    {
      spec: {
        name: 'remove_label',
        description: 'Remove a label from the issue.',
        input_schema: {
          type: 'object',
          properties: { label: { type: 'string' } },
          required: ['label'],
        },
      },
      handler: async (input: unknown) => {
        const { label } = input as { label: string };
        await removeLabel(client, issueNumber, label);
        return `removed ${label}`;
      },
    },
    {
      spec: {
        name: 'close_issue',
        description: 'Close the issue. Only when explicitly instructed.',
        input_schema: {
          type: 'object',
          properties: {
            reason: { type: 'string', enum: ['completed', 'not_planned'] },
            comment: { type: 'string', description: 'Closing comment to post first.' },
          },
          required: ['reason'],
        },
      },
      handler: async (input: unknown) => {
        const { reason, comment } = input as { reason: 'completed' | 'not_planned'; comment?: string };
        if (comment) await postComment(client, issueNumber, comment);
        await closeIssue(client, issueNumber, reason);
        return `closed as ${reason}`;
      },
    },
    {
      spec: {
        name: 'reopen_issue',
        description: 'Reopen a closed issue. Only when explicitly instructed.',
        input_schema: { type: 'object', properties: {}, required: [] },
      },
      handler: async () => {
        await reopenIssue(client, issueNumber);
        return 'reopened';
      },
    },
    {
      spec: {
        name: 'request_fix',
        description: 'Trigger a fix attempt on this issue. Use when the user asks you to fix or attempt a patch.',
        input_schema: { type: 'object', properties: {}, required: [] },
      },
      handler: async () => {
        await runFix({ client, apiKey, config, issueNumber });
        return 'fix attempt completed (see PR or comment)';
      },
    },
    {
      spec: {
        name: 'request_triage',
        description: 'Trigger a fresh triage of this issue.',
        input_schema: { type: 'object', properties: {}, required: [] },
      },
      handler: async () => {
        await runTriage({
          client,
          apiKey,
          config,
          event: {
            action: 'edited',
            issue_number: issue.number,
            title: issue.title,
            body: issue.body,
            author: issue.author,
            labels: issue.labels,
            state: issue.state,
            is_pull_request: issue.is_pull_request,
          },
        });
        return 'triage completed';
      },
    },
  ];

  const result = await runAgent({
    client: anthropic(apiKey),
    model: config.commands.intent_model,
    systemPrompt: INTENT_PROMPT,
    userPrompt,
    tools,
    budget,
    maxSteps: 8,
    maxTokensPerCall: 2048,
  });

  const summary = result.finalText.trim() || 'Done.';
  const footer = renderRunFooter({
    model: config.commands.intent_model,
    usage: budget.used(),
    runtimeMs: Date.now() - start,
  });
  await upsertStickyComment(
    client,
    issueNumber,
    'intent',
    `### Maintainer\n\n${summary}${footer}`,
  );

  log.info(`Intent completed in ${result.steps} steps, ${result.toolCalls} tool calls.`);
}
