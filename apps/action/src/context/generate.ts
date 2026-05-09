import { promises as fs } from 'fs';
import { join } from 'path';
import type { Octokit } from '../github/client.js';
import type { Config } from '../config/schema.js';
import { anthropic } from '../agent/client.js';
import { LEARN_PROMPT } from '../agent/prompts.js';
import { runAgent } from '../agent/loop.js';
import { TokenBudget } from '../util/budget.js';
import { renderRunFooter, type RunMetadata } from '../util/sticky.js';
import { upsertStickyComment, postComment } from '../github/issues.js';
import { Workspace } from '../fix/sandbox.js';
import { workspaceTools } from '../fix/tools.js';
import {
  getDefaultBranch,
  createDraftPullRequest,
  addPullRequestLabels,
  findOpenPullRequestForBranch,
  updatePullRequestBody,
} from '../github/prs.js';
import { repoOwner, repoName } from '../util/events.js';
import { CONTEXT_FILE_PATH } from './path.js';
import { log } from '../util/log.js';

export async function runLearn(args: {
  client: Octokit;
  apiKey: string;
  config: Config;
  issueNumber: number;
}): Promise<void> {
  const { client, apiKey, config, issueNumber } = args;
  const start = Date.now();

  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  try {
    await fs.access(join(workspace, '.git'));
  } catch {
    await postComment(
      client,
      issueNumber,
      'Maintainer cannot generate the project context: no checked-out repository in the workspace. Add `actions/checkout@v4` before the maintainer step.',
    );
    return;
  }

  const ws = new Workspace(workspace);
  const budget = new TokenBudget(config.fix.max_input_tokens, config.fix.max_output_tokens);
  const tools = workspaceTools(ws);

  const userPrompt = `Repository: ${repoOwner()}/${repoName()}

Generate the project-context document. Use the available tools to explore the repository. Save the result to ${CONTEXT_FILE_PATH} using write_file. The conventions and structure are described in the system prompt.`;

  const result = await runAgent({
    client: anthropic(apiKey),
    model: config.fix.model,
    systemPrompt: LEARN_PROMPT,
    userPrompt,
    tools,
    budget,
    maxSteps: Math.min(30, config.fix.max_steps),
    maxTokensPerCall: 8192,
  });

  const runMeta: RunMetadata = {
    model: config.fix.model,
    usage: budget.used(),
    runtimeMs: Date.now() - start,
  };
  const footer = renderRunFooter(runMeta);

  let wrote = false;
  try {
    const stat = await fs.stat(join(workspace, CONTEXT_FILE_PATH));
    wrote = stat.size > 0;
  } catch {
    wrote = false;
  }

  if (!wrote) {
    await upsertStickyComment(
      client,
      issueNumber,
      'intent',
      `### Maintainer learn

The agent did not produce a context file.

${result.finalText || 'No final summary available.'}${footer}`,
    );
    return;
  }

  const branchName = 'maintainer/learn';
  const baseBranch = await getDefaultBranch(client);
  const pushed = await commitAndPush(ws, branchName, baseBranch);
  if (!pushed) {
    await upsertStickyComment(
      client,
      issueNumber,
      'intent',
      `### Maintainer learn

Generated the context file but pushing the branch failed. Check the Action logs.${footer}`,
    );
    return;
  }

  const prBody = `Adds \`${CONTEXT_FILE_PATH}\` so future Maintainer runs can skip the exploration phase and operate against the same shared understanding of the repository.

This file is auto-generated. Re-run \`/maintainer learn\` after major code changes.

${result.finalText.trim() ? `**Agent notes:**\n\n${result.finalText.trim()}\n\n` : ''}---

This pull request was drafted by Maintainer. Review the generated document before merging.${footer}`;

  const existing = await findOpenPullRequestForBranch(client, branchName);
  let pr: { number: number; html_url: string };
  if (existing) {
    try {
      await updatePullRequestBody(client, existing.number, prBody);
    } catch (err) {
      log.warn(`Could not update PR body: ${(err as Error).message}`);
    }
    pr = existing;
  } else {
    try {
      pr = await createDraftPullRequest(client, {
        title: 'Add Maintainer project context',
        body: prBody,
        head: branchName,
        base: baseBranch,
      });
    } catch (err) {
      const msg = (err as Error).message;
      const branchUrl = `https://github.com/${repoOwner()}/${repoName()}/tree/${branchName}`;
      await upsertStickyComment(
        client,
        issueNumber,
        'intent',
        `### Maintainer learn

Generated the context file and pushed [\`${branchName}\`](${branchUrl}), but opening a pull request failed:

\`\`\`
${msg}
\`\`\`${footer}`,
      );
      return;
    }
  }

  try {
    await addPullRequestLabels(client, pr.number, [`${config.labels.prefix}needs-human-review`]);
  } catch {
    // best-effort
  }

  await upsertStickyComment(
    client,
    issueNumber,
    'intent',
    `### Maintainer learn

Project context drafted in [#${pr.number}](${pr.html_url}). Once merged, future fix and intent runs will load it automatically.${footer}`,
  );
}

async function commitAndPush(ws: Workspace, branch: string, base: string): Promise<boolean> {
  const actor = process.env.GITHUB_ACTOR ?? 'github-actions[bot]';
  const email = `${actor}@users.noreply.github.com`;
  const cmds: [string, string[]][] = [
    ['git', ['config', 'user.name', 'maintainer-bot']],
    ['git', ['config', 'user.email', email]],
    ['git', ['checkout', '-B', branch, base]],
    ['git', ['add', CONTEXT_FILE_PATH]],
    ['git', ['commit', '-m', 'Add Maintainer project context']],
    ['git', ['push', '-u', 'origin', branch, '--force-with-lease']],
  ];
  for (const [cmd, args] of cmds) {
    const r = await ws.run(cmd, args, { timeoutMs: 60_000 });
    if (r.code !== 0) {
      log.warn(`git step failed during learn: ${cmd} ${args.join(' ')} (exit ${r.code})\n${r.stderr}`);
      return false;
    }
  }
  return true;
}
