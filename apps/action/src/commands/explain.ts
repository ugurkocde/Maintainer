import type { Octokit } from '../github/client.js';
import type { Config } from '../config/schema.js';
import { anthropic } from '../agent/client.js';
import { EXPLAIN_PROMPT } from '../agent/prompts.js';
import { TokenBudget } from '../util/budget.js';
import { callStructured } from '../agent/loop.js';
import { getIssue, postComment } from '../github/issues.js';

export async function runExplain(args: {
  client: Octokit;
  apiKey: string;
  config: Config;
  issueNumber: number;
}): Promise<void> {
  const { client, apiKey, config, issueNumber } = args;
  const issue = await getIssue(client, issueNumber);
  const budget = new TokenBudget(20_000, 2_000);

  const result = await callStructured<{ plain_language: string }>({
    client: anthropic(apiKey),
    model: config.commands.intent_model,
    systemPrompt: EXPLAIN_PROMPT,
    userPrompt: `Issue #${issue.number}: ${issue.title}\n\n${issue.body || '(empty)'}`,
    schemaName: 'plain_language_explanation',
    schemaDescription: 'Plain-language rewrite of the issue.',
    inputSchema: {
      type: 'object',
      properties: { plain_language: { type: 'string' } },
      required: ['plain_language'],
    },
    budget,
    maxTokens: 1500,
  });

  await postComment(
    client,
    issueNumber,
    `**Plain-language summary**\n\n${result.value.plain_language}`,
  );
}
