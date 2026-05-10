'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { browserDb } from '@/lib/browser-db';
import type { Tables } from '@maintainer/supabase';
import {
  agentColor,
  formatCost,
  formatDuration,
  formatRelativeTime,
  formatTokens,
  outcomeColor,
  statusColor,
} from '@/lib/format';

type Run = Tables<'runs'>;
type AgentStep = Tables<'agent_steps'>;
type Issue = Tables<'issues'>;
type PullRequest = Tables<'pull_requests'>;
type Repo = Tables<'repos'>;

export type RunDetailData = {
  run: Run;
  issue: Issue | null;
  steps: AgentStep[];
  pull_request: PullRequest | null;
  repo: Repo | null;
};

export function LiveRunDetail({ initial }: { initial: RunDetailData }) {
  const [data, setData] = useState<RunDetailData>(initial);

  useEffect(() => {
    setData(initial);
  }, [initial]);

  useEffect(() => {
    const supa = browserDb();
    const runId = initial.run.id;

    const refresh = async () => {
      const { data: row, error } = await supa
        .from('runs')
        .select(
          '*, issue:issues(*), agent_steps(*), pull_request:pull_requests!runs_pr_id_fkey(*), repo:repos(*)',
        )
        .eq('id', runId)
        .maybeSingle();
      if (error || !row) return;
      const steps = ((row as { agent_steps?: AgentStep[] }).agent_steps ?? []).sort(
        (a, b) => a.position - b.position,
      );
      const { issue, agent_steps: _drop, pull_request, repo, ...run } = row as unknown as Run & {
        issue: Issue | null;
        agent_steps: AgentStep[];
        pull_request: PullRequest | null;
        repo: Repo | null;
      };
      setData({ run: run as Run, issue, steps, pull_request, repo });
    };

    const ch = supa
      .channel(`run:${runId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'runs', filter: `id=eq.${runId}` },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agent_steps', filter: `run_id=eq.${runId}` },
        () => void refresh(),
      )
      .subscribe();

    return () => {
      void supa.removeChannel(ch);
    };
  }, [initial.run.id]);

  const { run, issue, steps, pull_request, repo } = data;
  const totalInput =
    run.total_input_tokens +
    (run.total_cache_read_tokens ?? 0) +
    (run.total_cache_creation_tokens ?? 0);

  return (
    <div className="space-y-6">
      <nav className="text-sm text-ink-400">
        <Link href="/" className="hover:text-ink-100">home</Link>
        {repo && (
          <>
            <span className="mx-2 text-ink-600">/</span>
            <Link
              href={`/repos/${repo.owner}/${repo.name}`}
              className="hover:text-ink-100"
            >
              {repo.owner}/{repo.name}
            </Link>
          </>
        )}
        <span className="mx-2 text-ink-600">/</span>
        <span>run {run.id.slice(0, 8)}</span>
      </nav>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {run.status === 'running' ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-300">
              <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
              running
            </span>
          ) : (
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 ${statusColor(run.status)}`}
            >
              {run.status}
            </span>
          )}
          {run.outcome && (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 ${outcomeColor(run.outcome)}`}
            >
              {run.outcome}
            </span>
          )}
          <span className="text-ink-500">{run.trigger}</span>
          <span className="text-ink-600">·</span>
          <span className="text-ink-500">{formatRelativeTime(run.started_at)}</span>
          {run.github_run_url && (
            <>
              <span className="text-ink-600">·</span>
              <a
                href={run.github_run_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-500 hover:text-accent-600"
              >
                Action log
              </a>
            </>
          )}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {issue ? (
            <>
              <span className="text-ink-500">#{issue.github_issue_number}</span>{' '}
              {issue.title}
            </>
          ) : (
            <>Run {run.id.slice(0, 8)}</>
          )}
        </h1>
        {pull_request && (
          <p className="text-sm text-ink-400">
            Drafted{' '}
            <a
              href={pull_request.url}
              className="text-accent-500 hover:text-accent-600"
              target="_blank"
              rel="noopener noreferrer"
            >
              PR #{pull_request.github_pr_number}
            </a>{' '}
            · {pull_request.files_changed.length} file
            {pull_request.files_changed.length === 1 ? '' : 's'} · branch{' '}
            <code className="text-ink-300">{pull_request.branch}</code>
          </p>
        )}
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Cost" value={formatCost(run.total_cost_usd)} />
        <Stat label="Runtime" value={formatDuration(run.total_runtime_ms)} />
        <Stat label="Input" value={formatTokens(totalInput)} />
        <Stat label="Output" value={formatTokens(run.total_output_tokens)} />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-ink-300 mb-3 flex items-center gap-2">
          Agent timeline
          {run.status === 'running' && (
            <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-emerald-400">
              <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              live
            </span>
          )}
        </h2>
        <ol className="relative space-y-3 border-l border-white/10 pl-6">
          {steps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
          {run.status === 'running' && (
            <li className="relative">
              <span className="absolute -left-[27px] top-3 h-2 w-2 rounded-full bg-amber-400 pulse-dot" />
              <div className="glass px-4 py-3 text-sm text-ink-400 italic">
                Waiting for the next agent step…
              </div>
            </li>
          )}
        </ol>
      </section>

      {issue && (
        <section className="glass p-5 space-y-2">
          <h2 className="text-sm font-semibold text-ink-300">Triage verdict</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Field label="Type" value={issue.triage_type} />
            <Field label="Severity" value={issue.triage_severity} />
            <Field label="Scope" value={issue.triage_scope} />
            <Field label="Reproducible" value={issue.triage_reproducible} />
          </dl>
          {issue.triage_summary && (
            <p className="mt-3 text-sm text-ink-200 whitespace-pre-line">{issue.triage_summary}</p>
          )}
          {issue.triage_next_action && (
            <p className="mt-2 text-sm text-ink-400 italic whitespace-pre-line">
              Next: {issue.triage_next_action}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass px-4 py-4">
      <div className="text-xs text-ink-400">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="text-ink-100">{value ?? '–'}</dd>
    </div>
  );
}

function StepRow({ step }: { step: AgentStep }) {
  const isRunning = step.status === 'running';
  return (
    <li className="relative">
      <span
        className={`absolute -left-[27px] top-3 h-2 w-2 rounded-full ${
          isRunning ? 'bg-amber-400 pulse-dot' : 'bg-accent-500'
        }`}
      />
      <div className="glass px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-ink-500 tabular-nums">#{step.position}</span>
            <span className={`font-semibold ${agentColor(step.agent)}`}>{step.agent}</span>
            <span className="text-ink-500 text-xs font-mono">{step.model}</span>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${statusColor(step.status)}`}
            >
              {step.status}
            </span>
          </div>
          <div className="text-right text-xs text-ink-500 tabular-nums">
            <div>{formatCost(step.cost_usd)}</div>
            <div>
              {formatTokens(
                step.input_tokens + step.cache_creation_tokens + step.cache_read_tokens,
              )}{' '}
              in / {formatTokens(step.output_tokens)} out
            </div>
          </div>
        </div>
        {step.output_summary && (
          <p className="mt-2 text-sm text-ink-200">{step.output_summary}</p>
        )}
        {(step.tool_calls > 0 || step.steps > 0 || step.stop_reason) && (
          <p className="mt-2 text-xs text-ink-500">
            {step.tool_calls} tool calls · {step.steps} steps
            {step.stop_reason ? ` · stop: ${step.stop_reason}` : ''}
          </p>
        )}
      </div>
    </li>
  );
}
