import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Octokit } from '../github/client.js';
import type { Config } from '../config/schema.js';
import { anthropic } from '../agent/client.js';
import { FIX_PROMPT } from '../agent/prompts.js';
import { runAgent } from '../agent/loop.js';
import { TokenBudget } from '../util/budget.js';
import { renderRunFooter, renderRunDetailsBlock, type RunMetadata } from '../util/sticky.js';
import { getIssue, postComment, upsertStickyComment } from '../github/issues.js';
import { addLabels, removeLabel } from '../github/labels.js';
import { getDefaultBranch, createDraftPullRequest, addPullRequestLabels } from '../github/prs.js';
import { Workspace } from './sandbox.js';
import { workspaceTools } from './tools.js';
import { detectProject } from './detect.js';
import { repoOwner, repoName } from '../util/events.js';
import { log } from '../util/log.js';

export async function runFix(args: {
  client: Octokit;
  apiKey: string;
  config: Config;
  issueNumber: number;
}): Promise<void> {
  const { client, apiKey, config, issueNumber } = args;

  if (!config.fix.enabled) {
    log.info('Fix flow disabled in config.');
    return;
  }

  const start = Date.now();
  const issue = await getIssue(client, issueNumber);

  if (issue.is_pull_request) {
    log.info('Skipping fix flow on a pull request.');
    return;
  }

  const workspaceRoot = process.env.GITHUB_WORKSPACE ?? (await fs.mkdtemp(join(tmpdir(), 'maintainer-')));
  const cloned = await ensureCheckout(workspaceRoot, args.client);
  if (!cloned) {
    await postComment(
      client,
      issueNumber,
      'Maintainer was unable to check out the repository for a fix attempt.',
    );
    return;
  }

  const ws = new Workspace(workspaceRoot);
  const project = await detectProject(workspaceRoot);
  const testCommand = config.fix.test_command ?? project.test_command;
  const branchName = `maintainer/fix-${issueNumber}`;
  const baseBranch = await getDefaultBranch(client);

  const budget = new TokenBudget(config.fix.max_input_tokens, config.fix.max_output_tokens);

  const userPrompt = `Repository: ${repoOwner()}/${repoName()}
Issue #${issue.number}: ${issue.title}
Reporter: @${issue.author}
Labels: ${issue.labels.join(', ') || 'none'}

Detected project:
- language: ${project.language}
- package_manager: ${project.package_manager ?? 'n/a'}
- test_command: ${testCommand ?? 'unknown'}

Issue body:
"""
${issue.body || '(empty)'}
"""

Your job: implement a minimal correct fix and verify it with the test command above. If the test command is unknown, infer it from the project and proceed. When done, emit a final text block summarizing the fix, files changed, and test outcome. If you cannot fix it, emit a final text block describing what you tried and why you stopped.`;

  const tools = workspaceTools(ws);
  const result = await runAgent({
    client: anthropic(apiKey),
    model: config.fix.model,
    systemPrompt: FIX_PROMPT,
    userPrompt,
    tools,
    budget,
    maxSteps: config.fix.max_steps,
    maxTokensPerCall: 8192,
  });

  const changed = await ws.listChangedFiles();
  const runMeta: RunMetadata = {
    model: config.fix.model,
    inputTokens: budget.used().input,
    outputTokens: budget.used().output,
    runtimeMs: Date.now() - start,
  };
  const footer = renderRunFooter(runMeta);

  if (changed.length === 0) {
    const body = `### Maintainer fix attempt

Could not produce a fix.

${result.finalText || 'No final summary available.'}${footer}`;
    await upsertStickyComment(client, issueNumber, 'fix', body);
    await addLabels(client, issueNumber, [`${config.labels.prefix}fix-failed`]);
    return;
  }

  const testOutput = testCommand ? await runTests(ws, testCommand, config.fix.timeout_minutes) : null;
  const testsPassed = testOutput ? testOutput.code === 0 : null;

  if (testOutput && !testsPassed) {
    const body = `### Maintainer fix attempt

Made changes but tests failed. No PR opened.

**Files changed:** ${changed.join(', ')}

**Test command:** \`${testCommand}\`

**Test exit:** ${testOutput.code}${testOutput.timedOut ? ' (timed out)' : ''}

<details><summary>Test output (truncated)</summary>

\`\`\`
${(testOutput.stdout + '\n' + testOutput.stderr).slice(0, 8000)}
\`\`\`

</details>

**Agent summary:** ${result.finalText || '(none)'}${footer}`;
    await upsertStickyComment(client, issueNumber, 'fix', body);
    await addLabels(client, issueNumber, [`${config.labels.prefix}fix-failed`]);
    await ws.run('git', ['restore', '--staged', '--worktree', '.']);
    return;
  }

  const pushed = await commitAndPush(ws, branchName, baseBranch, issueNumber);
  if (!pushed) {
    await upsertStickyComment(
      client,
      issueNumber,
      'fix',
      `### Maintainer fix attempt\n\nMade changes and tests passed, but pushing the fix branch failed. Check the Action logs.${footer}`,
    );
    return;
  }

  const prBody = renderPrBody(issue.number, result.finalText, changed, testCommand, testOutput?.stdout ?? '', runMeta);
  const pr = await createDraftPullRequest(client, {
    title: truncateTitle(`Fix: ${issue.title}`, 200),
    body: prBody,
    head: branchName,
    base: baseBranch,
  });
  await addPullRequestLabels(client, pr.number, [`${config.labels.prefix}needs-human-review`]);

  const sticky = `### Maintainer fix attempt

Draft fix proposed in [#${pr.number}](${pr.html_url}). Tests passed. Awaiting your review.

**Files changed:** ${changed.join(', ')}

**Test command:** \`${testCommand ?? 'n/a'}\`${footer}`;
  await upsertStickyComment(client, issueNumber, 'fix', sticky);
  await addLabels(client, issueNumber, [`${config.labels.prefix}fix-proposed`]);
  await removeLabel(client, issueNumber, `${config.labels.prefix}fix-failed`);
}

async function ensureCheckout(root: string, _client: Octokit): Promise<boolean> {
  try {
    await fs.access(join(root, '.git'));
    return true;
  } catch {
    log.warn('No .git in workspace. Add `actions/checkout@v4` before the maintainer step for fix flows.');
    return false;
  }
}

async function runTests(
  ws: Workspace,
  testCommand: string,
  timeoutMinutes: number,
): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean }> {
  const parts = testCommand.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);
  return ws.run(cmd, args, { timeoutMs: timeoutMinutes * 60_000 });
}

async function commitAndPush(
  ws: Workspace,
  branch: string,
  base: string,
  issueNumber: number,
): Promise<boolean> {
  const actor = process.env.GITHUB_ACTOR ?? 'github-actions[bot]';
  const email = `${actor}@users.noreply.github.com`;

  const cmds: [string, string[]][] = [
    ['git', ['config', 'user.name', 'maintainer-bot']],
    ['git', ['config', 'user.email', email]],
    ['git', ['checkout', '-B', branch, base]],
    ['git', ['add', '-A']],
    ['git', ['commit', '-m', `Fix issue #${issueNumber}`]],
    ['git', ['push', '-u', 'origin', branch, '--force-with-lease']],
  ];
  for (const [cmd, args] of cmds) {
    const r = await ws.run(cmd, args, { timeoutMs: 60_000 });
    if (r.code !== 0) {
      log.warn(`git step failed: ${cmd} ${args.join(' ')} (exit ${r.code})\n${r.stderr}`);
      return false;
    }
  }
  return true;
}

function renderPrBody(
  issueNumber: number,
  agentSummary: string,
  files: string[],
  testCommand: string | undefined,
  testOut: string,
  runMeta: RunMetadata,
): string {
  const summary = agentSummary.trim() || '(no summary provided)';
  const runDetails = renderRunDetailsBlock(runMeta);
  return `Fixes #${issueNumber}

## Summary

${summary}

## Files changed

${files.map((f) => `- \`${f}\``).join('\n')}

## Tests

Command: \`${testCommand ?? 'n/a'}\`

<details><summary>Output (truncated)</summary>

\`\`\`
${testOut.slice(0, 6000)}
\`\`\`

</details>

${runDetails}

---

This pull request was drafted by Maintainer. It is intentionally opened as a draft and labeled \`maintainer:needs-human-review\`. Review the diff, the reasoning, and the test output before marking ready.`;
}

function truncateTitle(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}
