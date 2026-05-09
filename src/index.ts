import * as core from '@actions/core';
import { context } from '@actions/github';
import { loadConfig } from './config/load.js';
import { octokit } from './github/client.js';
import { ensureLabels } from './github/labels.js';
import { runTriage } from './triage/run.js';
import { handleComment } from './commands/router.js';
import { runDashboard } from './dashboard/run.js';
import { runStale } from './schedule/stale.js';
import { runDigest } from './schedule/digest.js';
import { parseIssuesEvent, parseIssueCommentEvent } from './util/events.js';
import { log } from './util/log.js';

type Mode = 'auto' | 'dashboard' | 'triage-only' | 'fix-only';

async function run(): Promise<void> {
  try {
    const apiKey = core.getInput('anthropic-api-key', { required: true });
    const token = core.getInput('github-token', { required: true });
    const mode = (core.getInput('mode') || 'auto') as Mode;
    const configPath = core.getInput('config-path') || '.github/maintainer.yml';

    core.setSecret(apiKey);
    core.setSecret(token);

    const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
    const config = await loadConfig(workspace, configPath);
    const client = octokit(token);

    log.info(`Maintainer ${context.repo.owner}/${context.repo.repo} | event=${context.eventName} | mode=${mode}`);

    if (mode === 'dashboard' || (mode === 'auto' && config.dashboard.enabled && context.eventName === 'schedule')) {
      await runDashboard({ client, apiKey, config });
      return;
    }

    await ensureLabels(client);

    switch (context.eventName) {
      case 'issues': {
        const evt = parseIssuesEvent(context.payload as Record<string, unknown>);
        if (evt.is_pull_request) {
          log.info('issues event on a pull request, skipping.');
          return;
        }
        if (evt.labels.includes(config.skip_label)) {
          log.info(`Issue #${evt.issue_number} has skip label, ignoring.`);
          return;
        }
        if (mode === 'fix-only') {
          log.info('mode=fix-only, skipping triage on issues event.');
          return;
        }
        if (!config.triage.enabled) {
          log.info('Triage disabled in config.');
          return;
        }
        if (!['opened', 'reopened', 'edited'].includes(evt.action)) {
          log.info(`Action "${evt.action}" not handled.`);
          return;
        }
        await runTriage({ client, apiKey, config, event: evt });
        break;
      }
      case 'issue_comment': {
        const evt = parseIssueCommentEvent(context.payload as Record<string, unknown>);
        if (evt.action !== 'created') return;
        if (!config.commands.enabled) {
          log.info('Commands disabled in config.');
          return;
        }
        await handleComment({ client, apiKey, config, event: evt });
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
    const message = err instanceof Error ? err.stack ?? err.message : String(err);
    core.setFailed(`Maintainer failed: ${message}`);
  }
}

void run();
