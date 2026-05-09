import { getOctokit } from '@actions/github';

export type Octokit = ReturnType<typeof getOctokit>;

let cached: Octokit | undefined;

export function octokit(token: string): Octokit {
  if (!cached) cached = getOctokit(token);
  return cached;
}

export function botLogin(): string {
  return process.env.GITHUB_ACTOR ?? 'github-actions[bot]';
}

export function isBotAuthor(login: string): boolean {
  const lower = login.toLowerCase();
  return (
    lower === 'github-actions[bot]' ||
    lower === 'github-actions' ||
    lower.endsWith('[bot]')
  );
}
