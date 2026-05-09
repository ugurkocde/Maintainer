import { promises as fs } from 'fs';
import { join } from 'path';
import type { Octokit } from '../github/client.js';
import type { Config } from '../config/schema.js';
import { renderStatus, type RepoSnapshot, type TopIssue } from './render.js';
import { repoOwner, repoName } from '../util/events.js';
import { log } from '../util/log.js';

export async function runDashboard(args: {
  client: Octokit;
  apiKey: string;
  config: Config;
}): Promise<void> {
  const { client, config } = args;

  if (!config.dashboard.enabled) {
    log.info('Dashboard disabled in config.');
    return;
  }

  const repos = config.dashboard.repos;
  if (repos.length === 0) {
    log.warn('Dashboard mode is enabled but no repos are configured.');
    return;
  }

  const snapshots: RepoSnapshot[] = [];
  for (const slug of repos) {
    const [owner, repo] = slug.split('/');
    if (!owner || !repo) {
      log.warn(`Invalid repo slug: ${slug}`);
      continue;
    }
    try {
      snapshots.push(await snapshotRepo(client, slug, config));
    } catch (err) {
      log.warn(`Could not snapshot ${slug}: ${(err as Error).message}`);
    }
  }

  const md = renderStatus(snapshots, new Date());
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const outputPath = join(workspace, config.dashboard.output_path);
  await fs.writeFile(outputPath, md, 'utf-8');
  log.info(`Wrote dashboard to ${outputPath}`);

  await commitStatus(workspace, outputPath);
  if (config.dashboard.open_briefing_issue) {
    await openOrUpdateBriefing(client, snapshots);
  }
}

async function snapshotRepo(client: Octokit, slug: string, config: Config): Promise<RepoSnapshot> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const prefix = config.labels.prefix;

  const [open, openedWeek, closedWeek, stale, needsRepro, fixProposed, needsHuman, agentPrOpen, agentPrMerged] =
    await Promise.all([
      countSearch(client, `repo:${slug} is:issue is:open`),
      countSearch(client, `repo:${slug} is:issue created:>${weekAgo}`),
      countSearch(client, `repo:${slug} is:issue closed:>${weekAgo}`),
      countSearch(client, `repo:${slug} is:issue is:open label:"${prefix}stale"`),
      countSearch(client, `repo:${slug} is:issue is:open label:"${prefix}needs-repro"`),
      countSearch(client, `repo:${slug} is:issue is:open label:"${prefix}fix-proposed"`),
      countSearch(client, `repo:${slug} is:issue is:open label:"${prefix}needs-human"`),
      countSearch(client, `repo:${slug} is:pr is:open label:"${prefix}needs-human-review"`),
      countSearch(client, `repo:${slug} is:pr is:merged label:"${prefix}needs-human-review"`),
    ]);

  const topIssues: TopIssue[] = [];
  try {
    const { data } = await client.rest.search.issuesAndPullRequests({
      q: `repo:${slug} is:issue is:open sort:reactions-+1-desc`,
      per_page: 5,
    });
    for (const it of data.items) {
      topIssues.push({
        number: it.number,
        title: it.title,
        url: it.html_url,
        reactions: it.reactions?.total_count ?? 0,
        age_days: Math.floor((Date.now() - new Date(it.created_at).getTime()) / 86_400_000),
      });
    }
  } catch {
    // best-effort
  }

  return {
    slug,
    open,
    opened_this_week: openedWeek,
    closed_this_week: closedWeek,
    stale,
    needs_repro: needsRepro,
    fix_proposed: fixProposed,
    needs_human: needsHuman,
    agent_pr_open: agentPrOpen,
    agent_pr_merged_total: agentPrMerged,
    top_issues: topIssues,
  };
}

async function countSearch(client: Octokit, q: string): Promise<number> {
  try {
    const { data } = await client.rest.search.issuesAndPullRequests({ q, per_page: 1 });
    return data.total_count;
  } catch {
    return 0;
  }
}

async function commitStatus(workspace: string, path: string): Promise<void> {
  try {
    await fs.access(join(workspace, '.git'));
  } catch {
    log.info('No git workspace, skipping commit of STATUS file.');
    return;
  }

  const { spawn } = await import('child_process');
  const run = (cmd: string, args: string[]): Promise<number> =>
    new Promise((resolveProm) => {
      const c = spawn(cmd, args, { cwd: workspace, shell: false });
      c.on('close', (code) => resolveProm(code ?? -1));
      c.on('error', () => resolveProm(-1));
    });

  const actor = process.env.GITHUB_ACTOR ?? 'github-actions[bot]';
  await run('git', ['config', 'user.name', 'maintainer-bot']);
  await run('git', ['config', 'user.email', `${actor}@users.noreply.github.com`]);
  const addCode = await run('git', ['add', path]);
  if (addCode !== 0) return;
  const diffCode = await run('git', ['diff', '--cached', '--quiet']);
  if (diffCode === 0) {
    log.info('STATUS unchanged, no commit needed.');
    return;
  }
  await run('git', ['commit', '-m', 'Update Maintainer status']);
  await run('git', ['push']);
}

async function openOrUpdateBriefing(client: Octokit, snapshots: RepoSnapshot[]): Promise<void> {
  const owner = repoOwner();
  const repo = repoName();
  const title = 'Weekly Maintainer briefing';
  const body = renderStatus(snapshots, new Date());

  try {
    const { data } = await client.rest.search.issuesAndPullRequests({
      q: `repo:${owner}/${repo} is:issue is:open in:title "${title}"`,
      per_page: 1,
    });
    if (data.total_count > 0) {
      await client.rest.issues.update({
        owner,
        repo,
        issue_number: data.items[0].number,
        body,
      });
    } else {
      await client.rest.issues.create({ owner, repo, title, body });
    }
  } catch (err) {
    log.warn(`Could not open briefing issue: ${(err as Error).message}`);
  }
}
