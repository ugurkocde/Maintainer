import type { Octokit } from './client.js';
import { repoOwner, repoName } from '../util/events.js';
import { findStickyComment, withStickyMarker, type StickyFlow } from '../util/sticky.js';

export type IssueDetail = {
  number: number;
  title: string;
  body: string;
  labels: string[];
  state: 'open' | 'closed';
  author: string;
  is_pull_request: boolean;
  created_at: string;
  updated_at: string;
};

export async function getIssue(client: Octokit, issueNumber: number): Promise<IssueDetail> {
  const { data } = await client.rest.issues.get({
    owner: repoOwner(),
    repo: repoName(),
    issue_number: issueNumber,
  });
  return {
    number: data.number,
    title: data.title,
    body: data.body ?? '',
    labels: (data.labels ?? []).map((l) => (typeof l === 'string' ? l : (l.name ?? ''))).filter(Boolean),
    state: data.state as 'open' | 'closed',
    author: data.user?.login ?? '',
    is_pull_request: Boolean(data.pull_request),
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export type CommentItem = { id: number; body: string; author: string; created_at: string };

export async function listComments(client: Octokit, issueNumber: number): Promise<CommentItem[]> {
  const all: CommentItem[] = [];
  const iter = client.paginate.iterator(client.rest.issues.listComments, {
    owner: repoOwner(),
    repo: repoName(),
    issue_number: issueNumber,
    per_page: 100,
  });
  for await (const page of iter) {
    for (const c of page.data) {
      all.push({ id: c.id, body: c.body ?? '', author: c.user?.login ?? '', created_at: c.created_at });
    }
  }
  return all;
}

export async function postComment(client: Octokit, issueNumber: number, body: string): Promise<number> {
  const { data } = await client.rest.issues.createComment({
    owner: repoOwner(),
    repo: repoName(),
    issue_number: issueNumber,
    body,
  });
  return data.id;
}

export async function updateComment(client: Octokit, commentId: number, body: string): Promise<void> {
  await client.rest.issues.updateComment({
    owner: repoOwner(),
    repo: repoName(),
    comment_id: commentId,
    body,
  });
}

export async function upsertStickyComment(
  client: Octokit,
  issueNumber: number,
  flow: StickyFlow,
  body: string,
): Promise<number> {
  const comments = await listComments(client, issueNumber);
  const existing = findStickyComment(comments, flow);
  const fullBody = withStickyMarker(flow, body);
  if (existing) {
    await updateComment(client, existing.id, fullBody);
    return existing.id;
  }
  return postComment(client, issueNumber, fullBody);
}

export type ReactionContent = '+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray' | 'rocket' | 'eyes';

export async function reactToComment(
  client: Octokit,
  commentId: number,
  content: ReactionContent,
): Promise<void> {
  try {
    await client.rest.reactions.createForIssueComment({
      owner: repoOwner(),
      repo: repoName(),
      comment_id: commentId,
      content,
    });
  } catch {
    // best-effort
  }
}

export async function reactToIssue(
  client: Octokit,
  issueNumber: number,
  content: ReactionContent,
): Promise<void> {
  try {
    await client.rest.reactions.createForIssue({
      owner: repoOwner(),
      repo: repoName(),
      issue_number: issueNumber,
      content,
    });
  } catch {
    // best-effort
  }
}

export async function closeIssue(
  client: Octokit,
  issueNumber: number,
  reason: 'completed' | 'not_planned' = 'completed',
): Promise<void> {
  await client.rest.issues.update({
    owner: repoOwner(),
    repo: repoName(),
    issue_number: issueNumber,
    state: 'closed',
    state_reason: reason,
  });
}

export async function reopenIssue(client: Octokit, issueNumber: number): Promise<void> {
  await client.rest.issues.update({
    owner: repoOwner(),
    repo: repoName(),
    issue_number: issueNumber,
    state: 'open',
  });
}

export async function userHasWriteAccess(client: Octokit, username: string): Promise<boolean> {
  try {
    const { data } = await client.rest.repos.getCollaboratorPermissionLevel({
      owner: repoOwner(),
      repo: repoName(),
      username,
    });
    return data.permission === 'admin' || data.permission === 'write' || data.permission === 'maintain';
  } catch {
    return false;
  }
}
