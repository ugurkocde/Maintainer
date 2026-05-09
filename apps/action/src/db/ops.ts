import type { Tables } from '@maintainer/supabase';
import { db } from './client.js';
import { log } from '../util/log.js';
import { estimateCost, type Usage } from '../util/pricing.js';

type Repo = Tables<'repos'>;
type Issue = Tables<'issues'>;
type Run = Tables<'runs'>;

async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    log.warn(`Supabase op "${label}" failed: ${(err as Error).message}`);
    return null;
  }
}

export async function ensureRepo(opts: { owner: string; name: string }): Promise<Repo | null> {
  const client = db();
  if (!client) return null;
  return safe('ensureRepo', async () => {
    const { data, error } = await client
      .from('repos')
      .upsert(
        { owner: opts.owner, name: opts.name },
        { onConflict: 'owner,name', ignoreDuplicates: false },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  });
}

export async function ensureIssue(opts: {
  repoId: string;
  number: number;
  title: string;
  body: string | null;
  authorLogin: string | null;
  state: 'open' | 'closed';
  labels: string[];
}): Promise<Issue | null> {
  const client = db();
  if (!client) return null;
  return safe('ensureIssue', async () => {
    const { data, error } = await client
      .from('issues')
      .upsert(
        {
          repo_id: opts.repoId,
          github_issue_number: opts.number,
          title: opts.title,
          body: opts.body,
          author_login: opts.authorLogin,
          state: opts.state,
          labels: opts.labels,
        },
        { onConflict: 'repo_id,github_issue_number', ignoreDuplicates: false },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  });
}

export type TriageVerdictUpdate = {
  type: string;
  severity: string;
  scope: string;
  reproducible: string;
  summary: string;
  next_action: string;
  duplicates: number[];
  fixable: boolean;
};

export async function recordTriageVerdict(issueId: string, verdict: TriageVerdictUpdate): Promise<void> {
  const client = db();
  if (!client) return;
  await safe('recordTriageVerdict', async () => {
    const { error } = await client
      .from('issues')
      .update({
        triage_type: verdict.type,
        triage_severity: verdict.severity,
        triage_scope: verdict.scope,
        triage_reproducible: verdict.reproducible,
        triage_summary: verdict.summary,
        triage_next_action: verdict.next_action,
        duplicates_of: verdict.duplicates,
        fixable: verdict.fixable,
        triaged_at: new Date().toISOString(),
      })
      .eq('id', issueId);
    if (error) throw error;
    return null;
  });
}

export async function startRun(opts: {
  repoId: string;
  issueId?: string | null;
  trigger: string;
  triggerPayload?: unknown;
  githubRunId?: number;
  githubRunUrl?: string;
}): Promise<string | null> {
  const client = db();
  if (!client) return null;
  return safe('startRun', async () => {
    const { data, error } = await client
      .from('runs')
      .insert({
        repo_id: opts.repoId,
        issue_id: opts.issueId ?? null,
        trigger: opts.trigger,
        trigger_payload: (opts.triggerPayload ?? null) as Run['trigger_payload'],
        github_run_id: opts.githubRunId ?? null,
        github_run_url: opts.githubRunUrl ?? null,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  });
}

export type AgentName =
  | 'triager'
  | 'reproducer'
  | 'researcher'
  | 'fixer'
  | 'tester'
  | 'reviewer'
  | 'documenter'
  | 'intent'
  | 'learn'
  | 'explain';

export type StepStatus = 'succeeded' | 'failed' | 'rate_limited' | 'budget_exhausted';

export async function recordAgentStep(opts: {
  runId: string | null;
  position: number;
  agent: AgentName;
  model: string;
  status: StepStatus;
  inputSummary?: string;
  outputSummary?: string;
  usage: Usage;
  toolCalls?: number;
  steps?: number;
  stopReason?: string;
  metadata?: Record<string, unknown>;
  startedAt: Date;
  finishedAt?: Date;
}): Promise<void> {
  const client = db();
  if (!client || !opts.runId) return;

  const cost = estimateCost(opts.model, opts.usage);
  const finished = opts.finishedAt ?? new Date();

  await safe('recordAgentStep', async () => {
    const { error } = await client.from('agent_steps').insert({
      run_id: opts.runId!,
      position: opts.position,
      agent: opts.agent,
      model: opts.model,
      status: opts.status,
      input_summary: opts.inputSummary ?? null,
      output_summary: opts.outputSummary ?? null,
      input_tokens: opts.usage.inputTokens,
      output_tokens: opts.usage.outputTokens,
      cache_creation_tokens: opts.usage.cacheCreationTokens ?? 0,
      cache_read_tokens: opts.usage.cacheReadTokens ?? 0,
      cost_usd: cost ?? 0,
      tool_calls: opts.toolCalls ?? 0,
      steps: opts.steps ?? 0,
      stop_reason: opts.stopReason ?? null,
      metadata: (opts.metadata ?? {}) as Run['trigger_payload'],
      started_at: opts.startedAt.toISOString(),
      finished_at: finished.toISOString(),
    });
    if (error) throw error;
    return null;
  });
}

export async function finishRun(opts: {
  runId: string | null;
  status: 'succeeded' | 'failed' | 'rate_limited' | 'budget_exhausted';
  outcome?: 'triage_only' | 'fix_proposed' | 'fix_failed' | 'no_action' | 'duplicate' | 'context_generated';
  totalRuntimeMs?: number;
}): Promise<void> {
  const client = db();
  if (!client || !opts.runId) return;
  await safe('finishRun', async () => {
    const { data: steps, error: stepsErr } = await client
      .from('agent_steps')
      .select('input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, cost_usd')
      .eq('run_id', opts.runId!);
    if (stepsErr) throw stepsErr;

    const totals = (steps ?? []).reduce(
      (acc, s) => ({
        input: acc.input + s.input_tokens,
        output: acc.output + s.output_tokens,
        creation: acc.creation + s.cache_creation_tokens,
        read: acc.read + s.cache_read_tokens,
        cost: acc.cost + Number(s.cost_usd),
      }),
      { input: 0, output: 0, creation: 0, read: 0, cost: 0 },
    );

    const { error } = await client
      .from('runs')
      .update({
        status: opts.status,
        outcome: opts.outcome ?? null,
        total_input_tokens: totals.input,
        total_output_tokens: totals.output,
        total_cache_creation_tokens: totals.creation,
        total_cache_read_tokens: totals.read,
        total_cost_usd: totals.cost,
        total_runtime_ms: opts.totalRuntimeMs ?? null,
        finished_at: new Date().toISOString(),
      })
      .eq('id', opts.runId!);
    if (error) throw error;
    return null;
  });
}

export async function recordPullRequest(opts: {
  repoId: string;
  issueId: string | null;
  runId: string | null;
  prNumber: number;
  title: string;
  branch: string;
  baseBranch: string;
  filesChanged: string[];
  url: string;
}): Promise<string | null> {
  const client = db();
  if (!client) return null;
  return safe('recordPullRequest', async () => {
    const { data, error } = await client
      .from('pull_requests')
      .upsert(
        {
          repo_id: opts.repoId,
          issue_id: opts.issueId,
          run_id: opts.runId,
          github_pr_number: opts.prNumber,
          title: opts.title,
          branch: opts.branch,
          base_branch: opts.baseBranch,
          files_changed: opts.filesChanged,
          url: opts.url,
        },
        { onConflict: 'repo_id,github_pr_number', ignoreDuplicates: false },
      )
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  });
}

export async function attachPrToRun(runId: string | null, prId: string): Promise<void> {
  const client = db();
  if (!client || !runId) return;
  await safe('attachPrToRun', async () => {
    const { error } = await client.from('runs').update({ pr_id: prId }).eq('id', runId);
    if (error) throw error;
    return null;
  });
}

export async function attachIssueToRun(runId: string | null, issueId: string): Promise<void> {
  const client = db();
  if (!client || !runId) return;
  await safe('attachIssueToRun', async () => {
    const { error } = await client.from('runs').update({ issue_id: issueId }).eq('id', runId);
    if (error) throw error;
    return null;
  });
}
