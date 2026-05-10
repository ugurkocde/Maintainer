'use client';

import { useEffect, useState } from 'react';
import { browserDb } from '@/lib/browser-db';
import { formatCost } from '@/lib/format';
import type { Totals } from '@/lib/db';

export function LiveTotals({ initial }: { initial: Totals }) {
  const [t, setT] = useState<Totals>(initial);

  useEffect(() => {
    const supa = browserDb();

    const refresh = async () => {
      const [runs, repos, issues, prs] = await Promise.all([
        supa.from('runs').select('outcome, status, total_cost_usd'),
        supa.from('repos').select('id', { count: 'exact', head: true }),
        supa.from('issues').select('id, triaged_at'),
        supa.from('pull_requests').select('merged'),
      ]);
      const runRows = runs.data ?? [];
      const issueRows = issues.data ?? [];
      const prRows = prs.data ?? [];
      const minutes_saved = runRows.reduce((acc, r) => {
        if (r.outcome === 'fix_proposed') return acc + 30;
        if (r.outcome === 'triage_only') return acc + 5;
        if (r.outcome === 'duplicate') return acc + 5;
        return acc;
      }, 0);
      setT({
        repos: repos.count ?? 0,
        runs: runRows.length,
        issues_triaged: issueRows.filter((i) => i.triaged_at != null).length,
        prs_drafted: prRows.length,
        prs_merged: prRows.filter((p) => p.merged).length,
        total_cost_usd: runRows.reduce((sum, r) => sum + Number(r.total_cost_usd ?? 0), 0),
        minutes_saved,
        active_runs: runRows.filter((r) => r.status === 'running').length,
      });
    };

    const ch = supa
      .channel('totals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'runs' }, () => void refresh())
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pull_requests' },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'issues' },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'repos' },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supa.removeChannel(ch);
    };
  }, []);

  return (
    <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <Stat label="Repos" value={t.repos.toLocaleString()} />
      <Stat label="Runs" value={t.runs.toLocaleString()} />
      <Stat label="Triaged" value={t.issues_triaged.toLocaleString()} />
      <Stat label="Draft PRs" value={t.prs_drafted.toLocaleString()} />
      <Stat
        label="Time saved"
        value={`${(t.minutes_saved / 60).toFixed(1)}h`}
        sublabel={`${t.minutes_saved} minutes`}
      />
      <Stat
        label="Spend"
        value={formatCost(t.total_cost_usd)}
        emphasis={t.active_runs > 0 ? 'live' : undefined}
      />
    </section>
  );
}

function Stat({
  label,
  value,
  sublabel,
  emphasis,
}: {
  label: string;
  value: string;
  sublabel?: string;
  emphasis?: 'live';
}) {
  return (
    <div className="glass px-4 py-4">
      <div className="flex items-center gap-2 text-xs text-ink-400">
        {emphasis === 'live' && (
          <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
        )}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sublabel && <div className="text-xs text-ink-500 tabular-nums">{sublabel}</div>}
    </div>
  );
}
