import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type { Octokit } from '../github/client.js';
import type { Config } from '../config/schema.js';
import { anthropic } from '../agent/client.js';
import { FIX_PROMPT } from '../agent/prompts.js';
import { runAgent } from '../agent/loop.js';
import { TokenBudget } from '../util/budget.js';
import { renderRunFooter, renderRunDetailsBlock, type RunMetadata } from '../util/sticky.js';
import { getIssue, postComment, upsertStickyComment } from '../github/issues.js';
import { addLabels, removeLabel } from '../github/labels.js';
import {
  getDefaultBranch,
  createDraftPullRequest,
  addPullRequestLabels,
  findOpenPullRequestForBranch,
  updatePullRequestBody,
} from '../github/prs.js';
import { Workspace } from './sandbox.js';
import { workspaceTools } from './tools.js';
import { detectProject } from './detect.js';
import { repoOwner, repoName } from '../util/events.js';
import { loadProjectContext } from '../context/load.js';
import { CONTEXT_FILE_PATH } from '../context/path.js';
import { recordAgentStep, recordPullRequest, attachPrToRun } from '../db/ops.js';
import type { RunState } from '../index.js';
import { runReview, renderReviewBlock, type ReviewVerdict } from '../review/run.js';
import { log } from '../util/log.js';

export type FixOutcome = 'fix_proposed' | 'fix_failed' | 'no_action';

export async function runFix(args: {
  client: Octokit;
  apiKey: string;
  config: Config;
  issueNumber: number;
  runState?: RunState;
}): Promise<FixOutcome | undefined> {
  const { client, apiKey, config, issueNumber, runState } = args;

  if (!config.fix.enabled) {
    log.info('Fix flow disabled in config.');
    return 'no_action';
  }

  const start = Date.now();
  const startedAt = new Date(start);
  const issue = await getIssue(client, issueNumber);

  if (issue.is_pull_request) {
    log.info('Skipping fix flow on a pull request.');
    return 'no_action';
  }

  const workspaceRoot = process.env.GITHUB_WORKSPACE ?? (await fs.mkdtemp(join(tmpdir(), 'maintainer-')));
  const cloned = await ensureCheckout(workspaceRoot, args.client);
  if (!cloned) {
    await postComment(
      client,
      issueNumber,
      'Maintainer was unable to check out the repository for a fix attempt.',
    );
    return 'no_action';
  }

  const ws = new Workspace(workspaceRoot);
  const project = await detectProject(workspaceRoot);
  const testCommand = config.fix.test_command ?? project.test_command;
  const branchName = `maintainer/fix-${issueNumber}`;
  const baseBranch = await getDefaultBranch(client);

  const budget = new TokenBudget(config.fix.max_input_tokens, config.fix.max_output_tokens);

  const recordStep = async (
    status: 'succeeded' | 'failed' | 'rate_limited' | 'budget_exhausted',
    outputSummary: string,
    metadata: Record<string, unknown> = {},
    extra: { stopReason?: string; stepsCount?: number; toolCalls?: number } = {},
  ): Promise<void> => {
    if (!runState?.runId) return;
    await recordAgentStep({
      runId: runState.runId,
      position: 1,
      agent: 'fixer',
      model: config.fix.model,
      status,
      inputSummary: `Issue #${issue.number}: ${issue.title.slice(0, 120)}`,
      outputSummary,
      usage: budget.used(),
      toolCalls: extra.toolCalls,
      steps: extra.stepsCount,
      stopReason: extra.stopReason,
      metadata,
      startedAt,
    });
  };

  const projectContext = await loadProjectContext(workspaceRoot);
  const contextSection = projectContext
    ? `\nProject context (from ${CONTEXT_FILE_PATH}):\n"""\n${projectContext}\n"""\n\nUse this as your starting map. Verify file paths and line numbers before editing, but skip broad re-exploration unless the context is clearly stale.`
    : `\nNo project-context file at ${CONTEXT_FILE_PATH}. Future runs will be cheaper if a maintainer runs \`/maintainer learn\` to generate one.`;

  const userPrompt = `Repository: ${repoOwner()}/${repoName()}
Issue #${issue.number}: ${issue.title}
Reporter: @${issue.author}
Labels: ${issue.labels.join(', ') || 'none'}

Detected project:
- language: ${project.language}
- package_manager: ${project.package_manager ?? 'n/a'}
- test_command: ${testCommand ?? 'unknown'}
${contextSection}

Issue body:
"""
${issue.body || '(empty)'}
"""

Your job: implement a minimal correct fix and verify it with the test command above. If the test command is unknown, infer it from the project and proceed. When done, emit a final text block summarizing the fix, files changed, and test outcome. If you cannot fix it, emit a final text block describing what you tried and why you stopped.`;

  const tools = workspaceTools(ws);
  const anth = anthropic(apiKey);
  let result = await runAgent({
    client: anth,
    model: config.fix.model,
    systemPrompt: FIX_PROMPT,
    userPrompt,
    tools,
    budget,
    maxSteps: config.fix.max_steps,
    maxTokensPerCall: 8192,
  });

  let changed = await ws.listChangedFiles();

  if (
    changed.length === 0 &&
    !budget.exhausted() &&
    result.stopReason !== 'api_error' &&
    result.toolCalls > 0
  ) {
    log.info('Agent ended without writing files. Sending one nudge to apply the fix.');
    const nudge: MessageParam = {
      role: 'user',
      content:
        'You ended the previous turn without calling write_file. No files were changed on disk. Apply your fix now using write_file. Tool calls only. Do not describe what you will do; do it.',
    };
    result = await runAgent({
      client: anth,
      model: config.fix.model,
      systemPrompt: FIX_PROMPT,
      priorMessages: [...result.messages, nudge],
      tools,
      budget,
      maxSteps: Math.min(10, config.fix.max_steps),
      maxTokensPerCall: 8192,
    });
    changed = await ws.listChangedFiles();
  }

  // Scope to files the agent intentionally wrote via write_file. Side-effect
  // mutations (npm install touching package-lock.json, build artifacts, etc.)
  // appear in `git status` but never in writtenPaths, so they get filtered
  // out before staging, the diff fed to the reviewer, and the PR.
  if (ws.writtenPaths.size > 0) {
    const intentional = ws.writtenPaths;
    changed = changed.filter((f) => intentional.has(f));
  }

  const runMeta: RunMetadata = {
    model: config.fix.model,
    usage: budget.used(),
    runtimeMs: Date.now() - start,
  };
  const footer = renderRunFooter(runMeta);

  if (changed.length === 0) {
    const body = `### Maintainer fix attempt

Could not produce a fix.

${result.finalText || 'No final summary available.'}${footer}`;
    await upsertStickyComment(client, issueNumber, 'fix', body);
    await addLabels(client, issueNumber, [`${config.labels.prefix}fix-failed`]);
    await recordStep(
      result.stopReason === 'rate_limited' ? 'rate_limited' : 'failed',
      'no files changed',
      { reason: 'no_files_changed' },
      { stopReason: result.stopReason, stepsCount: result.steps, toolCalls: result.toolCalls },
    );
    return 'fix_failed';
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
    await recordStep(
      'failed',
      `tests failed: exit ${testOutput.code}`,
      { files_changed: changed, test_command: testCommand, test_exit: testOutput.code },
      { stopReason: result.stopReason, stepsCount: result.steps, toolCalls: result.toolCalls },
    );
    return 'fix_failed';
  }

  // Reviewer pass: capture diff against the base, ask the reviewer to grade
  // the change, and bail before commit/push if it rejects (when configured to
  // block). This adds a second specialist agent to the timeline.
  const diffPaths = changed.length > 0 ? changed : ['.'];
  const diffResult = await ws.run(
    'git',
    ['diff', `origin/${baseBranch}`, '--', ...diffPaths],
    { timeoutMs: 30_000 },
  );
  const fullDiff = diffResult.code === 0 ? diffResult.stdout : '';

  const review: ReviewVerdict | null = await runReview({
    ws,
    apiKey,
    config,
    issueNumber: issue.number,
    issueTitle: issue.title,
    issueBody: issue.body,
    diff: fullDiff,
    files: changed,
    testCommand,
    testOutput: testOutput ? `${testOutput.stdout}\n${testOutput.stderr}` : undefined,
    fixerSummary: result.finalText,
    language: project.language,
    runState,
    position: 2,
  });

  if (review && !review.approved && config.review.block_on_reject) {
    const concerns = review.concerns.length
      ? '\n\n**Reviewer concerns:**\n' + review.concerns.map((c) => `- ${c}`).join('\n')
      : '';
    const sticky = `### Maintainer fix attempt

Reviewer rejected the proposed change before opening a pull request: ${review.summary}${concerns}

**Files changed:** ${changed.join(', ')}

**Agent summary:** ${result.finalText || '(none)'}${footer}`;
    await upsertStickyComment(client, issueNumber, 'fix', sticky);
    await addLabels(client, issueNumber, [`${config.labels.prefix}fix-failed`]);
    await ws.run('git', ['restore', '--staged', '--worktree', '.']);
    await recordStep(
      'failed',
      `reviewer rejected: ${review.summary.slice(0, 160)}`,
      { files_changed: changed, review },
      { stopReason: result.stopReason, stepsCount: result.steps, toolCalls: result.toolCalls },
    );
    return 'fix_failed';
  }

  const pushed = await commitAndPush(ws, branchName, baseBranch, issueNumber, changed);
  if (!pushed) {
    await upsertStickyComment(
      client,
      issueNumber,
      'fix',
      `### Maintainer fix attempt\n\nMade changes and tests passed, but pushing the fix branch failed. Check the Action logs.${footer}`,
    );
    await recordStep(
      'failed',
      'push failed',
      { files_changed: changed, branch: branchName },
      { stopReason: result.stopReason, stepsCount: result.steps, toolCalls: result.toolCalls },
    );
    return 'fix_failed';
  }

  const reviewBlock = review ? `\n\n${renderReviewBlock(review)}\n` : '';
  const prBody = renderPrBody(
    issue.number,
    result.finalText,
    changed,
    testCommand,
    testOutput?.stdout ?? '',
    runMeta,
    reviewBlock,
  );
  const branchUrl = `https://github.com/${repoOwner()}/${repoName()}/tree/${branchName}`;
  const compareUrl = `https://github.com/${repoOwner()}/${repoName()}/compare/${baseBranch}...${branchName}`;

  const existing = await findOpenPullRequestForBranch(client, branchName);
  let pr: { number: number; html_url: string };
  if (existing) {
    log.info(`Reusing existing PR #${existing.number} for branch ${branchName}`);
    try {
      await updatePullRequestBody(client, existing.number, prBody);
    } catch (err) {
      log.warn(`Could not update PR body: ${(err as Error).message}`);
    }
    pr = existing;
  } else {
    try {
      pr = await createDraftPullRequest(client, {
        title: truncateTitle(`Fix: ${issue.title}`, 200),
        body: prBody,
        head: branchName,
        base: baseBranch,
      });
    } catch (err) {
      const msg = (err as Error).message;
      log.warn(`PR creation failed: ${msg}`);
      const hint = msg.includes('not permitted to create or approve pull requests')
        ? '\n\n**Action required:** enable "Allow GitHub Actions to create and approve pull requests" in this repository\'s Actions settings, then re-run by closing and reopening this issue.'
        : '';
      const fallback = `### Maintainer fix attempt

Made changes and tests passed, but opening a pull request failed:

\`\`\`
${msg}
\`\`\`${hint}

The fix is on branch [\`${branchName}\`](${branchUrl}). Review the diff: [${baseBranch}...${branchName}](${compareUrl}).

**Files changed:** ${changed.join(', ')}${footer}`;
      await upsertStickyComment(client, issueNumber, 'fix', fallback);
      await addLabels(client, issueNumber, [`${config.labels.prefix}fix-failed`]);
      await recordStep(
        'failed',
        `pr_create_failed: ${msg.slice(0, 160)}`,
        { files_changed: changed, branch: branchName, error: msg },
        { stopReason: result.stopReason, stepsCount: result.steps, toolCalls: result.toolCalls },
      );
      return 'fix_failed';
    }
  }

  try {
    await addPullRequestLabels(client, pr.number, [`${config.labels.prefix}needs-human-review`]);
  } catch (err) {
    log.warn(`Could not label PR: ${(err as Error).message}`);
  }

  const sticky = `### Maintainer fix attempt

Draft fix proposed in [#${pr.number}](${pr.html_url}). Tests ${testsPassed === false ? 'were not run' : 'passed'}. Awaiting your review.

**Files changed:** ${changed.join(', ')}

**Test command:** \`${testCommand ?? 'n/a'}\`${footer}`;
  await upsertStickyComment(client, issueNumber, 'fix', sticky);
  await addLabels(client, issueNumber, [`${config.labels.prefix}fix-proposed`]);
  await removeLabel(client, issueNumber, `${config.labels.prefix}fix-failed`);

  if (runState?.repoId) {
    const prRowId = await recordPullRequest({
      repoId: runState.repoId,
      issueId: runState.issueId ?? null,
      runId: runState.runId,
      prNumber: pr.number,
      title: truncateTitle(`Fix: ${issue.title}`, 200),
      branch: branchName,
      baseBranch,
      filesChanged: changed,
      url: pr.html_url,
    });
    if (prRowId) await attachPrToRun(runState.runId, prRowId);
  }

  await recordStep(
    'succeeded',
    `draft PR #${pr.number} (${changed.length} files)`,
    {
      pr_number: pr.number,
      pr_url: pr.html_url,
      files_changed: changed,
      branch: branchName,
      tests_passed: testsPassed,
    },
    { stopReason: result.stopReason, stepsCount: result.steps, toolCalls: result.toolCalls },
  );

  return 'fix_proposed';
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
  intentionalFiles: string[],
): Promise<boolean> {
  const actor = process.env.GITHUB_ACTOR ?? 'github-actions[bot]';
  const email = `${actor}@users.noreply.github.com`;

  // Stage only the files the agent intentionally wrote. If we have no
  // intentional list we fall back to -A; otherwise unrelated mutations
  // (lockfiles, build outputs) are left out of the commit.
  const addArgs = intentionalFiles.length > 0 ? ['add', ...intentionalFiles] : ['add', '-A'];

  const cmds: [string, string[]][] = [
    ['git', ['config', 'user.name', 'maintainer-bot']],
    ['git', ['config', 'user.email', email]],
    ['git', ['checkout', '-B', branch, base]],
    ['git', addArgs],
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
  reviewBlock: string,
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
${reviewBlock}
---

This pull request was drafted by Maintainer. It is intentionally opened as a draft and labeled \`maintainer:needs-human-review\`. Review the diff, the reasoning, and the test output before marking ready.`;
}

function truncateTitle(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}
