import type { Octokit } from './client.js';
import { repoOwner, repoName } from '../util/events.js';
import { log } from '../util/log.js';

export type LabelDef = { name: string; color: string; description: string };

export function standardLabels(): LabelDef[] {
  return [
    { name: 'maintainer:bug', color: 'd73a4a', description: 'Confirmed bug, classified by Maintainer' },
    { name: 'maintainer:feature', color: 'a2eeef', description: 'Feature request, classified by Maintainer' },
    { name: 'maintainer:question', color: 'd876e3', description: 'Question or support request' },
    { name: 'maintainer:needs-repro', color: 'fbca04', description: 'Reporter needs to provide reproduction steps' },
    { name: 'maintainer:duplicate', color: 'cfd3d7', description: 'Likely duplicate, see linked issue' },
    { name: 'maintainer:fix-proposed', color: '0e8a16', description: 'Maintainer drafted a fix PR' },
    { name: 'maintainer:fix-failed', color: 'b60205', description: 'Maintainer attempted a fix but did not succeed' },
    { name: 'maintainer:needs-human', color: 'e99695', description: 'Outside of automation scope, human attention required' },
    { name: 'maintainer:needs-human-review', color: 'fbca04', description: 'Draft PR awaiting human review' },
    { name: 'maintainer:skip', color: 'ededed', description: 'Skip Maintainer automation for this issue or PR' },
    { name: 'maintainer:severity-critical', color: 'b60205', description: 'Severity: critical' },
    { name: 'maintainer:severity-high', color: 'd93f0b', description: 'Severity: high' },
    { name: 'maintainer:severity-medium', color: 'fbca04', description: 'Severity: medium' },
    { name: 'maintainer:severity-low', color: '0e8a16', description: 'Severity: low' },
  ];
}

export async function ensureLabels(client: Octokit, defs: LabelDef[] = standardLabels()): Promise<void> {
  const owner = repoOwner();
  const repo = repoName();

  const existing = new Set<string>();
  try {
    const iter = client.paginate.iterator(client.rest.issues.listLabelsForRepo, {
      owner,
      repo,
      per_page: 100,
    });
    for await (const page of iter) {
      for (const lbl of page.data) existing.add(lbl.name);
    }
  } catch (err) {
    log.warn(`Could not list existing labels: ${(err as Error).message}`);
    return;
  }

  for (const def of defs) {
    if (existing.has(def.name)) continue;
    try {
      await client.rest.issues.createLabel({
        owner,
        repo,
        name: def.name,
        color: def.color,
        description: def.description,
      });
      log.info(`Created label: ${def.name}`);
    } catch (err) {
      log.warn(`Could not create label ${def.name}: ${(err as Error).message}`);
    }
  }
}

export async function addLabels(client: Octokit, issueNumber: number, names: string[]): Promise<void> {
  if (names.length === 0) return;
  await client.rest.issues.addLabels({
    owner: repoOwner(),
    repo: repoName(),
    issue_number: issueNumber,
    labels: names,
  });
}

export async function removeLabel(client: Octokit, issueNumber: number, name: string): Promise<void> {
  try {
    await client.rest.issues.removeLabel({
      owner: repoOwner(),
      repo: repoName(),
      issue_number: issueNumber,
      name,
    });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status !== 404) throw err;
  }
}
