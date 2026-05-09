import type { Octokit } from '../github/client.js';
import type { Config } from '../config/schema.js';
import { repoOwner, repoName } from '../util/events.js';
import { addLabels, removeLabel } from '../github/labels.js';
import { postComment, closeIssue } from '../github/issues.js';
import { log } from '../util/log.js';

const STALE_LABEL_SUFFIX = 'stale';

export async function runStale(args: { client: Octokit; config: Config }): Promise<void> {
  const { client, config } = args;
  if (!config.stale.enabled) return;

  const owner = repoOwner();
  const repo = repoName();
  const staleLabel = `${config.labels.prefix}${STALE_LABEL_SUFFIX}`;
  const exemptLabels = new Set([...config.stale.exempt_labels, config.skip_label]);

  const now = Date.now();
  const staleCutoff = now - config.stale.days_until_stale * 86_400_000;
  const closeCutoff = now - config.stale.days_until_close * 86_400_000;

  const iter = client.paginate.iterator(client.rest.issues.listForRepo, {
    owner,
    repo,
    state: 'open',
    per_page: 100,
  });

  let marked = 0;
  let closed = 0;

  for await (const page of iter) {
    for (const issue of page.data) {
      if (issue.pull_request) continue;
      const labels = (issue.labels ?? [])
        .map((l) => (typeof l === 'string' ? l : l.name ?? ''))
        .filter(Boolean);
      if (labels.some((l) => exemptLabels.has(l))) continue;

      const updated = new Date(issue.updated_at).getTime();
      const hasStaleLabel = labels.includes(staleLabel);

      if (!hasStaleLabel && updated < staleCutoff) {
        await addLabels(client, issue.number, [staleLabel]);
        await postComment(
          client,
          issue.number,
          `This issue has had no activity for ${config.stale.days_until_stale} days. It will be closed in ${config.stale.days_until_close} days unless there is new activity. Comment to keep it open.`,
        );
        marked += 1;
        continue;
      }

      if (hasStaleLabel) {
        const staledOn = updated;
        if (staledOn < closeCutoff) {
          await closeIssue(client, issue.number, 'not_planned');
          closed += 1;
        }
      }
    }
  }

  log.info(`Stale sweep: marked=${marked}, closed=${closed}`);
}

export async function unstaleOnActivity(
  client: Octokit,
  config: Config,
  issueNumber: number,
): Promise<void> {
  await removeLabel(client, issueNumber, `${config.labels.prefix}${STALE_LABEL_SUFFIX}`);
}
