import type { Octokit } from './client.js';
import { repoOwner, repoName } from '../util/events.js';

export type SearchHit = {
  number: number;
  title: string;
  state: 'open' | 'closed';
  is_pull_request: boolean;
  url: string;
  body_excerpt: string;
};

export async function searchIssues(
  client: Octokit,
  query: string,
  limit = 10,
): Promise<SearchHit[]> {
  const owner = repoOwner();
  const repo = repoName();
  const fullQuery = `repo:${owner}/${repo} ${query}`;
  try {
    const { data } = await client.rest.search.issuesAndPullRequests({
      q: fullQuery,
      per_page: Math.min(limit, 100),
      sort: 'updated',
      order: 'desc',
    });
    return data.items.slice(0, limit).map((it) => ({
      number: it.number,
      title: it.title,
      state: it.state as 'open' | 'closed',
      is_pull_request: Boolean(it.pull_request),
      url: it.html_url,
      body_excerpt: (it.body ?? '').slice(0, 280),
    }));
  } catch {
    return [];
  }
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[`*_~#>\-[\]()]/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3 && !STOPWORDS.has(t));
}

const STOPWORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'when', 'what', 'where', 'which',
  'while', 'should', 'would', 'could', 'about', 'after', 'before', 'because',
  'there', 'their', 'these', 'those', 'they', 'them', 'then', 'than', 'into',
  'been', 'being', 'doing', 'does', 'didn', 'doesn', 'just', 'like', 'maybe',
  'some', 'such', 'thing', 'things', 'will', 'using', 'used', 'http', 'https',
  'github', 'issue', 'issues', 'error', 'errors', 'fail', 'fails', 'failed',
]);

export async function findCandidateDuplicates(
  client: Octokit,
  issueNumber: number,
  title: string,
  body: string,
): Promise<SearchHit[]> {
  const terms = Array.from(new Set([...tokenize(title), ...tokenize(body)]));
  if (terms.length === 0) return [];

  const top = terms.slice(0, 5).join(' ');
  const query = `is:issue ${top} -${issueNumber}`;
  return searchIssues(client, query, 10);
}
