import type { Octokit } from './client.js';
import { repoOwner, repoName } from '../util/events.js';

export async function getDefaultBranch(client: Octokit): Promise<string> {
  const { data } = await client.rest.repos.get({ owner: repoOwner(), repo: repoName() });
  return data.default_branch;
}

export async function createDraftPullRequest(
  client: Octokit,
  opts: {
    title: string;
    body: string;
    head: string;
    base: string;
  },
): Promise<{ number: number; html_url: string }> {
  const { data } = await client.rest.pulls.create({
    owner: repoOwner(),
    repo: repoName(),
    title: opts.title,
    body: opts.body,
    head: opts.head,
    base: opts.base,
    draft: true,
  });
  return { number: data.number, html_url: data.html_url };
}

export async function addPullRequestLabels(
  client: Octokit,
  prNumber: number,
  labels: string[],
): Promise<void> {
  if (labels.length === 0) return;
  await client.rest.issues.addLabels({
    owner: repoOwner(),
    repo: repoName(),
    issue_number: prNumber,
    labels,
  });
}
