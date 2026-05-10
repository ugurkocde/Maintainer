import type { Octokit } from './client.js';
import { repoOwner, repoName } from '../util/events.js';
import { log } from '../util/log.js';

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
  } catch (err) {
    // Surface failures so quota exhaustion (search has a stricter
    // secondary rate limit, 30/min authenticated) is visible in the
    // Action log. Returning [] silently means dedup goes blind under
    // load and every issue looks unique.
    log.warn(`searchIssues failed for "${fullQuery.slice(0, 80)}": ${(err as Error).message}`);
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
  // Two parallel searches:
  // 1. Token-overlap query (precise, sometimes too narrow if title is generic).
  // 2. Title-phrase OR-query against open issues (catches near-restatements
  //    that the tokenize+stopword filter would discard).
  // Plus the most-recently-updated open issues as a safety net so the LLM
  // always has a candidate set to consider, even when both searches miss.
  const terms = Array.from(new Set([...tokenize(title), ...tokenize(body)]));

  const tokenQuery = terms.length > 0 ? `is:issue ${terms.slice(0, 5).join(' ')} -${issueNumber}` : '';
  const titleWords = title
    .replace(/[`*_~#>[\]()]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 6);
  const titleQuery =
    titleWords.length > 0 ? `is:issue in:title ${titleWords.join(' OR ')} -${issueNumber}` : '';
  const recentQuery = `is:issue is:open sort:updated-desc -${issueNumber}`;

  const [tokenHits, titleHits, recentHits] = await Promise.all([
    tokenQuery ? searchIssues(client, tokenQuery, 8) : Promise.resolve([] as SearchHit[]),
    titleQuery ? searchIssues(client, titleQuery, 8) : Promise.resolve([] as SearchHit[]),
    searchIssues(client, recentQuery, 5),
  ]);

  const seen = new Set<number>([issueNumber]);
  const merged: SearchHit[] = [];
  for (const list of [tokenHits, titleHits, recentHits]) {
    for (const hit of list) {
      if (seen.has(hit.number)) continue;
      seen.add(hit.number);
      merged.push(hit);
      if (merged.length >= 12) return merged;
    }
  }
  return merged;
}
