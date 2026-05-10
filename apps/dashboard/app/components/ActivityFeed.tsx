'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLiveActivity, type ActivityEntry } from '@/lib/use-realtime';
import {
  agentColor,
  formatCost,
  formatDuration,
  formatRelativeTime,
  outcomeColor,
  statusColor,
} from '@/lib/format';

type Filter = 'all' | 'fix_proposed' | 'fix_failed' | 'triage_only' | 'running';

export function ActivityFeed({ initial, showFilters = true }: { initial: ActivityEntry[]; showFilters?: boolean }) {
  const entries = useLiveActivity(initial, 50);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filter === 'running' && e.run.status !== 'running') return false;
      if (filter !== 'all' && filter !== 'running' && e.run.outcome !== filter) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      const haystack = [
        e.run.trigger,
        e.repo ? `${e.repo.owner}/${e.repo.name}` : '',
        e.issue?.title ?? '',
        e.issue?.github_issue_number ? `#${e.issue.github_issue_number}` : '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, filter, query]);

  if (entries.length === 0) {
    return (
      <p className="text-ink-400 text-sm">
        No runs yet. Open an issue on a configured repository to start the feed.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <FilterPill label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
          <FilterPill
            label="Drafted"
            active={filter === 'fix_proposed'}
            onClick={() => setFilter('fix_proposed')}
            tone="emerald"
          />
          <FilterPill
            label="Failed"
            active={filter === 'fix_failed'}
            onClick={() => setFilter('fix_failed')}
            tone="red"
          />
          <FilterPill
            label="Triage"
            active={filter === 'triage_only'}
            onClick={() => setFilter('triage_only')}
            tone="sky"
          />
          <FilterPill
            label="Running"
            active={filter === 'running'}
            onClick={() => setFilter('running')}
            tone="amber"
          />
          <input
            type="search"
            placeholder="search repo, issue, trigger…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="ml-auto w-full sm:w-64 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-ink-100 placeholder:text-ink-500 focus:border-accent-500 focus:outline-none"
          />
        </div>
      )}
      {filtered.length === 0 ? (
        <p className="text-ink-500 text-sm py-8 text-center">No runs match this filter.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((e) => (
            <ActivityRow key={e.run.id} entry={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
  tone,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: 'emerald' | 'red' | 'sky' | 'amber';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'data-[active=true]:bg-emerald-500/15 data-[active=true]:text-emerald-300 data-[active=true]:border-emerald-500/40'
      : tone === 'red'
        ? 'data-[active=true]:bg-red-500/15 data-[active=true]:text-red-300 data-[active=true]:border-red-500/40'
        : tone === 'sky'
          ? 'data-[active=true]:bg-sky-500/15 data-[active=true]:text-sky-300 data-[active=true]:border-sky-500/40'
          : tone === 'amber'
            ? 'data-[active=true]:bg-amber-500/15 data-[active=true]:text-amber-300 data-[active=true]:border-amber-500/40'
            : 'data-[active=true]:bg-white/[0.08] data-[active=true]:text-ink-100 data-[active=true]:border-white/[0.12]';
  return (
    <button
      type="button"
      data-active={active}
      onClick={onClick}
      className={`inline-flex items-center rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[11px] uppercase tracking-wider text-ink-400 transition hover:text-ink-200 ${toneClass}`}
    >
      {label}
    </button>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const { run, issue, steps, pull_request, repo } = entry;
  const title = issue
    ? `#${issue.github_issue_number} ${issue.title}`
    : run.trigger;
  return (
    <li className="slide-in">
      <Link
        href={`/runs/${run.id}`}
        className="group block glass hover:bg-white/[0.04] transition px-4 py-3 flex items-start justify-between gap-4"
      >
        <div className="min-w-0 flex-1">
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
            {repo && (
              <span className="text-ink-500 truncate">
                {repo.owner}<span className="text-ink-600">/</span>{repo.name}
              </span>
            )}
            <span className="text-ink-600 hidden sm:inline">·</span>
            <span className="text-ink-500">{formatRelativeTime(run.started_at)}</span>
          </div>
          <p className="mt-1.5 truncate text-ink-100 group-hover:text-white">
            {title}
          </p>
          {steps.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {steps.map((s) => (
                <span
                  key={s.id}
                  className={`inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-2 py-0.5 text-[11px] ${agentColor(s.agent)}`}
                >
                  {s.status === 'running' && (
                    <span className="pulse-dot inline-block h-1 w-1 rounded-full bg-current" />
                  )}
                  {s.agent}
                </span>
              ))}
              {pull_request && (
                <a
                  href={pull_request.url}
                  className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-500/20"
                  onClick={(e) => e.stopPropagation()}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  PR #{pull_request.github_pr_number}
                </a>
              )}
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="font-medium tabular-nums">{formatCost(run.total_cost_usd)}</div>
          <div className="text-xs text-ink-400 tabular-nums">
            {formatDuration(run.total_runtime_ms)}
          </div>
        </div>
      </Link>
    </li>
  );
}
