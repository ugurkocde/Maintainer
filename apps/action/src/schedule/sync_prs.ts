import type { Octokit } from '../github/client.js';
import { repoOwner, repoName } from '../util/events.js';
import { db } from '../db/client.js';
import { log } from '../util/log.js';

/**
 * Reconciles pull_requests rows with their current GitHub state.
 *
 * The Action only writes a pull_requests row when it first creates the
 * draft PR. Once a maintainer marks it ready, merges it, or closes it
 * without merging, the database row goes stale unless we sync it back.
 * This runs as part of the weekly schedule pass and updates state +
 * merged + merged_at for every Maintainer-authored PR on the current
 * repository. Cheap; one GitHub API call per open or recently-touched
 * PR row.
 */
export async function syncPullRequests(args: { client: Octokit }): Promise<void> {
  const { client } = args;
  const supa = db();
  if (!supa) {
    log.info('Supabase not configured; skipping PR sync.');
    return;
  }

  const owner = repoOwner();
  const repo = repoName();

  const { data: repoRow, error: repoErr } = await supa
    .from('repos')
    .select('id')
    .eq('owner', owner)
    .eq('name', repo)
    .maybeSingle();
  if (repoErr || !repoRow) {
    log.info('Repo not yet recorded in Supabase; skipping PR sync.');
    return;
  }

  // Reconcile non-terminal PRs only; merged rows never change again.
  // Filter at the DB level (not in memory) so an aged repo with many
  // historical merged PRs doesn't trigger one GitHub API call per
  // merged row. Cap at 50 in-flight rows per schedule pass to stay
  // far below GitHub's secondary rate limit even on busy repos.
  const { data: rows, error } = await supa
    .from('pull_requests')
    .select('id, github_pr_number, state, merged')
    .eq('repo_id', repoRow.id)
    .eq('merged', false)
    .limit(50);
  if (error || !rows || rows.length === 0) return;

  let updated = 0;
  for (const row of rows) {
    try {
      const { data: pr } = await client.rest.pulls.get({
        owner,
        repo,
        pull_number: row.github_pr_number,
      });
      const nextState =
        pr.merged_at != null ? 'merged' : pr.state === 'closed' ? 'closed' : 'open';
      const patch = {
        state: nextState,
        merged: pr.merged_at != null,
        merged_at: pr.merged_at,
        ready_for_review: !pr.draft,
      };
      const dirty =
        nextState !== row.state ||
        Boolean(pr.merged_at) !== row.merged;
      if (!dirty) continue;
      const { error: upErr } = await supa.from('pull_requests').update(patch).eq('id', row.id);
      if (upErr) {
        log.warn(`PR sync update failed for #${row.github_pr_number}: ${upErr.message}`);
      } else {
        updated += 1;
      }
    } catch (err) {
      log.warn(`PR sync fetch failed for #${row.github_pr_number}: ${(err as Error).message}`);
    }
  }
  log.info(`PR sync done. ${updated} row${updated === 1 ? '' : 's'} updated.`);
}
