import type { Octokit } from '../github/client.js';
import type { Config } from '../config/schema.js';
import type { ParsedIssueCommentEvent } from '../util/events.js';
import { parseCommand } from './parse.js';
import { isBotAuthor } from '../github/client.js';
import { reactToComment, userHasWriteAccess, getIssue, postComment } from '../github/issues.js';
import { addLabels } from '../github/labels.js';
import { runTriage } from '../triage/run.js';
import { runFix } from '../fix/run.js';
import { runIntent } from './intent.js';
import { runExplain } from './explain.js';
import { runLearn } from '../context/generate.js';
import { ensureIssue, attachIssueToRun } from '../db/ops.js';
import type { RunState } from '../index.js';
import { log } from '../util/log.js';

export async function handleComment(args: {
  client: Octokit;
  apiKey: string;
  config: Config;
  event: ParsedIssueCommentEvent;
  runState?: RunState;
}): Promise<void> {
  const { client, apiKey, config, event, runState } = args;

  if (isBotAuthor(event.comment_author)) {
    log.debug('Ignoring comment by bot author.');
    return;
  }

  const parsed = parseCommand(event.comment_body);
  if (parsed.kind === 'none') return;

  // Allowlist takes precedence when set: only listed users can trigger.
  // When not set, fall back to the looser write-access check.
  const allowed = config.commands.allowed_users;
  if (allowed.length > 0) {
    const author = event.comment_author.toLowerCase();
    const ok = allowed.some((u) => u.toLowerCase() === author);
    if (!ok) {
      log.info(`Ignoring command from @${event.comment_author}; not in allowed_users.`);
      return;
    }
  } else if (config.commands.require_write_permission) {
    const ok = await userHasWriteAccess(client, event.comment_author);
    if (!ok) {
      log.info(`Ignoring command from non-collaborator @${event.comment_author}`);
      return;
    }
  }

  await reactToComment(client, event.comment_id, 'eyes');

  // Ensure the issue row exists (and back-fill runState.issueId) so command
  // flows can attach their agent_steps to the right issue when reading from
  // the dashboard later.
  if (runState?.repoId && !runState.issueId) {
    try {
      const issueDetail = await getIssue(client, event.issue_number);
      const issueRow = await ensureIssue({
        repoId: runState.repoId,
        number: issueDetail.number,
        title: issueDetail.title,
        body: issueDetail.body,
        authorLogin: issueDetail.author,
        state: issueDetail.state,
        labels: issueDetail.labels,
      });
      if (issueRow) {
        runState.issueId = issueRow.id;
        await attachIssueToRun(runState.runId, issueRow.id);
      }
    } catch (err) {
      log.warn(`Could not ensure issue row: ${(err as Error).message}`);
    }
  }

  try {
    if (parsed.kind === 'slash') {
      await handleSlash(parsed.command, parsed.args, args);
    } else {
      await runIntent({
        client,
        apiKey,
        config,
        issueNumber: event.issue_number,
        commentId: event.comment_id,
        instruction: parsed.instruction,
        invokedBy: event.comment_author,
        runState,
      });
    }
    await reactToComment(client, event.comment_id, 'rocket');
    await reactToComment(client, event.comment_id, '+1');
  } catch (err) {
    log.error(`Command failed: ${(err as Error).message}`);
    await reactToComment(client, event.comment_id, 'confused');
    await postComment(
      client,
      event.issue_number,
      `Maintainer hit an error executing that command:\n\n\`\`\`\n${(err as Error).message}\n\`\`\``,
    );
  }
}

async function handleSlash(
  command: string,
  cmdArgs: string,
  ctx: { client: Octokit; apiKey: string; config: Config; event: ParsedIssueCommentEvent; runState?: RunState },
): Promise<void> {
  const { client, apiKey, config, event, runState } = ctx;

  switch (command) {
    case 'triage': {
      const issue = await getIssue(client, event.issue_number);
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
        runState,
      });
      if (runState) runState.outcome = 'triage_only';
      break;
    }
    case 'fix': {
      const result = await runFix({ client, apiKey, config, issueNumber: event.issue_number, runState });
      if (runState && result) runState.outcome = result;
      break;
    }
    case 'skip': {
      await addLabels(client, event.issue_number, [config.skip_label]);
      await postComment(
        client,
        event.issue_number,
        'Maintainer will skip this issue. Remove the skip label to re-enable automation.',
      );
      if (runState) runState.outcome = 'no_action';
      break;
    }
    case 'explain': {
      await runExplain({ client, apiKey, config, issueNumber: event.issue_number });
      break;
    }
    case 'dedupe': {
      const issue = await getIssue(client, event.issue_number);
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
        runState,
      });
      if (runState) runState.outcome = 'triage_only';
      break;
    }
    case 'learn': {
      await runLearn({ client, apiKey, config, issueNumber: event.issue_number, runState });
      if (runState) runState.outcome = 'context_generated';
      break;
    }
    case 'help': {
      await postComment(client, event.issue_number, helpText());
      break;
    }
    default:
      await postComment(
        client,
        event.issue_number,
        `Unknown command: \`/maintainer ${command}\`. Try \`/maintainer help\`.${cmdArgs ? '' : ''}`,
      );
  }
}

function helpText(): string {
  return [
    '**Maintainer commands**',
    '',
    '- `/maintainer triage` — re-run triage on this issue',
    '- `/maintainer fix` — attempt a fix and open a draft pull request',
    '- `/maintainer explain` — rewrite this issue in plain language',
    '- `/maintainer dedupe` — re-search for duplicates',
    '- `/maintainer skip` — disable automation for this issue',
    '- `/maintainer learn` — regenerate the project-context document used by future runs',
    '- `/maintainer help` — show this list',
    '',
    'You can also write `@maintainer <natural language instruction>` for free-form requests.',
  ].join('\n');
}
