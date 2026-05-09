import { context } from '@actions/github';

export type IssueRef = { owner: string; repo: string; issue_number: number };

export type ParsedIssuesEvent = {
  action: string;
  issue_number: number;
  title: string;
  body: string;
  author: string;
  labels: string[];
  state: 'open' | 'closed';
  is_pull_request: boolean;
};

export type ParsedIssueCommentEvent = {
  action: string;
  issue_number: number;
  issue_title: string;
  issue_body: string;
  is_pull_request: boolean;
  comment_id: number;
  comment_body: string;
  comment_author: string;
  comment_url: string;
};

export const repoSlug = (): string => `${context.repo.owner}/${context.repo.repo}`;
export const repoOwner = (): string => context.repo.owner;
export const repoName = (): string => context.repo.repo;

export function issueRef(issue_number: number): IssueRef {
  return { owner: repoOwner(), repo: repoName(), issue_number };
}

export function parseIssuesEvent(payload: Record<string, unknown>): ParsedIssuesEvent {
  const issue = payload.issue as Record<string, unknown> | undefined;
  if (!issue) throw new Error('issues event payload missing "issue" field');

  return {
    action: String(payload.action ?? ''),
    issue_number: Number(issue.number),
    title: String(issue.title ?? ''),
    body: String(issue.body ?? ''),
    author: String((issue.user as Record<string, unknown> | undefined)?.login ?? ''),
    labels: Array.isArray(issue.labels)
      ? (issue.labels as Array<{ name?: string }>).map((l) => l.name ?? '').filter(Boolean)
      : [],
    state: (String(issue.state ?? 'open') as 'open' | 'closed'),
    is_pull_request: Boolean(issue.pull_request),
  };
}

export function parseIssueCommentEvent(payload: Record<string, unknown>): ParsedIssueCommentEvent {
  const issue = payload.issue as Record<string, unknown> | undefined;
  const comment = payload.comment as Record<string, unknown> | undefined;
  if (!issue || !comment) {
    throw new Error('issue_comment event payload missing "issue" or "comment" field');
  }

  return {
    action: String(payload.action ?? ''),
    issue_number: Number(issue.number),
    issue_title: String(issue.title ?? ''),
    issue_body: String(issue.body ?? ''),
    is_pull_request: Boolean(issue.pull_request),
    comment_id: Number(comment.id),
    comment_body: String(comment.body ?? ''),
    comment_author: String((comment.user as Record<string, unknown> | undefined)?.login ?? ''),
    comment_url: String(comment.html_url ?? ''),
  };
}
