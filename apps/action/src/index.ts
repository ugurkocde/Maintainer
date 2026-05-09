import * as core from '@actions/core';
import { context } from '@actions/github';
import { loadConfig } from './config/load.js';
import { octokit } from './github/client.js';
import { ensureLabels } from './github/labels.js';
import { runTriage } from './triage/run.js';
import { runFix } from './fix/run.js';
import { handleComment } from './commands/router.js';
import { runDashboard } from './dashboard/run.js';
import { runStale } from './schedule/stale.js';
import { runDigest } from './schedule/digest.js';
import { parseIssuesEvent, parseIssueCommentEvent } from './util/events.js';
import { log } from './util/log.js';
import { ensureRepo, ensureIssue, startRun, finishRun } from './db/ops.js';

type Mode = 'auto' | 'dashboard' | 'triage-only' | 'fix-only';

export type RunState = {
  runId: string | null;
  repoId: string | null;
  issueId: string | null;
  startedAt: number;
};

async function run(): Promise<void> {
  const startedAt = Date.now();
  let runState: RunState = { runId: null, repoId: null, issueId: null, startedAt };
  let outcome: Parameters<typeof finishRun>[0]['outcome'];
  let status: Parameters<typeof finishRun>[0]['status'] = 'succeeded';

  try {
    const apiKey = core.getInput('anthropic-api-key', { required: true });
    const token = core.getInput('github-token') || process.env.GITHUB_TOKEN || '';
    if (!token) {
      core.setFailed(
        'No GitHub token available. Either pass `github-token` as an input or run inside a workflow that provides GITHUB_TOKEN.',
      );
      return;
    }
    const mode = (core.getInput('mode') || 'auto') as Mode;
    const configPath = core.getInput('config-path') || '.github/maintainer.yml';

    const supabaseUrl = core.getInput('supabase-url');
    const supabaseSecret = core.getInput('supabase-secret-key');
    if (supabaseUrl) process.env.SUPABASE_URL = supabaseUrl;
    if (supabaseSecret) {
      process.env.SUPABASE_SECRET_KEY = supabaseSecret;
      core.setSecret(supabaseSecret);
    }

    core.setSecret(apiKey);
    core.setSecret(token);

    const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
    const config = await loadConfig(workspace, configPath);
    const client = octokit(token);

    log.info(`Maintainer ${context.repo.owner}/${context.repo.repo} | event=${context.eventName} | mode=${mode}`);

    const repo = await ensureRepo({ owner: context.repo.owner, name: context.repo.repo });
    runState.repoId = repo?.id ?? null;

    if (mode === 'dashboard' || (mode === 'auto' && config.dashboard.enabled && context.eventName === 'schedule')) {
      await runDashboard({ client, apiKey, config });
      return;
    }

    await ensureLabels(client);

    if (runState.repoId) {
      const githubRunId = process.env.GITHUB_RUN_ID ? Number(process.env.GITHUB_RUN_ID) : undefined;
      const githubRunUrl = githubRunId
        ? `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${githubRunId}`
        : undefined;
      runState.runId = await startRun({
        repoId: runState.repoId,
        trigger: `${context.eventName}.${(context.payload as { action?: string }).action ?? 'unknown'}`,
        githubRunId,
        githubRunUrl,
      });
    }

    switch (context.eventName) {
      case 'issues': {
        const evt = parseIssuesEvent(context.payload as Record<string, unknown>);
        if (evt.is_pull_request) {
          log.info('issues event on a pull request, skipping.');
          outcome = 'no_action';
          return;
        }
        if (evt.labels.includes(config.skip_label)) {
          log.info(`Issue #${evt.issue_number} has skip label, ignoring.`);
          outcome = 'no_action';
          return;
        }
        if (mode === 'fix-only') {
          log.info('mode=fix-only, skipping triage on issues event.');
          outcome = 'no_action';
          return;
        }
        if (!config.triage.enabled) {
          log.info('Triage disabled in config.');
          outcome = 'no_action';
          return;
        }
        if (!['opened', 'reopened', 'edited'].includes(evt.action)) {
          log.info(`Action "${evt.action}" not handled.`);
          outcome = 'no_action';
          return;
        }

        if (runState.repoId) {
          const issue = await ensureIssue({
            repoId: runState.repoId,
            number: evt.issue_number,
            title: evt.title,
            body: evt.body,
            authorLogin: evt.author,
            state: evt.state,
            labels: evt.labels,
          });
          runState.issueId = issue?.id ?? null;
        }

        const verdict = await runTriage({ client, apiKey, config, event: evt, runState });
        outcome = 'triage_only';
        if (
          verdict?.fixable &&
          config.fix.enabled &&
          config.fix.auto_attempt &&
          evt.action === 'opened' &&
          mode !== 'triage-only'
        ) {
          log.info(`Triage flagged issue #${evt.issue_number} as fixable; chaining to fix flow.`);
          const fixResult = await runFix({ client, apiKey, config, issueNumber: evt.issue_number, runState });
          outcome = fixResult ?? 'fix_failed';
        }
        break;
      }
      case 'issue_comment': {
        const evt = parseIssueCommentEvent(context.payload as Record<string, unknown>);
        if (evt.action !== 'created') return;
        if (!config.commands.enabled) {
          log.info('Commands disabled in config.');
          return;
        }
        await handleComment({ client, apiKey, config, event: evt, runState });
        break;
      }
      case 'schedule': {
        if (config.stale.enabled) await runStale({ client, config });
        if (config.dashboard.enabled) {
          await runDashboard({ client, apiKey, config });
        } else {
          await runDigest({ client, config });
        }
        break;
      }
      case 'workflow_dispatch': {
        log.info('workflow_dispatch received. No work for this event by default.');
        break;
      }
      case 'pull_request': {
        log.info('pull_request received. Tracking handled passively via reactions on linked issues.');
        break;
      }
      default:
        log.info(`Event "${context.eventName}" not handled.`);
    }

    log.info('Maintainer done.');
  } catch (err) {
    status = 'failed';
    const message = err instanceof Error ? err.stack ?? err.message : String(err);
    core.setFailed(`Maintainer failed: ${message}`);
  } finally {
    await finishRun({
      runId: runState.runId,
      status,
      outcome,
      totalRuntimeMs: Date.now() - startedAt,
    });
  }
}

void run();
