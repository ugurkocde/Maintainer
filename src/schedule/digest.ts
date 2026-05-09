import type { Octokit } from '../github/client.js';
import type { Config } from '../config/schema.js';
import { repoOwner, repoName } from '../util/events.js';
import { log } from '../util/log.js';

export async function runDigest(args: { client: Octokit; config: Config }): Promise<void> {
  const { client } = args;
  const owner = repoOwner();
  const repo = repoName();

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  const [openCount, closedThisWeek, openedThisWeek] = await Promise.all([
    countSearch(client, `repo:${owner}/${repo} is:issue is:open`),
    countSearch(client, `repo:${owner}/${repo} is:issue closed:>${weekAgo.slice(0, 10)}`),
    countSearch(client, `repo:${owner}/${repo} is:issue created:>${weekAgo.slice(0, 10)}`),
  ]);

  log.info(
    `Weekly digest for ${owner}/${repo}: open=${openCount}, opened_this_week=${openedThisWeek}, closed_this_week=${closedThisWeek}`,
  );
}

async function countSearch(client: Octokit, q: string): Promise<number> {
  try {
    const { data } = await client.rest.search.issuesAndPullRequests({ q, per_page: 1 });
    return data.total_count;
  } catch {
    return 0;
  }
}
