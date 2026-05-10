import type { DailyStat } from '@/lib/db';
import { formatCost } from '@/lib/format';

export function SpendChart({ days }: { days: DailyStat[] }) {
  if (days.length === 0) return null;

  const maxCost = Math.max(...days.map((d) => d.cost_usd), 0.01);
  const totalCost = days.reduce((s, d) => s + d.cost_usd, 0);
  const totalRuns = days.reduce((s, d) => s + d.runs, 0);
  const totalDrafted = days.reduce((s, d) => s + d.fix_proposed, 0);

  const chartHeight = 96; // px
  const labelEvery = days.length > 10 ? 3 : 1;

  return (
    <div className="glass p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-ink-300">
          Last {days.length} days
        </h2>
        <div className="text-xs text-ink-400 tabular-nums">
          {totalRuns} run{totalRuns === 1 ? '' : 's'} · {totalDrafted} drafted ·{' '}
          <span className="text-ink-200">{formatCost(totalCost)}</span>
        </div>
      </div>
      <div className="flex items-end gap-1" style={{ height: chartHeight }}>
        {days.map((d, idx) => {
          const h = (d.cost_usd / maxCost) * chartHeight;
          const isFix = d.fix_proposed > 0;
          return (
            <div key={d.day} className="group flex-1 relative flex flex-col items-center justify-end">
              <div
                className={`w-full rounded-sm transition ${
                  d.cost_usd > 0
                    ? isFix
                      ? 'bg-accent-500/70 group-hover:bg-accent-500'
                      : 'bg-ink-600 group-hover:bg-ink-500'
                    : 'bg-white/[0.04]'
                }`}
                style={{ height: `${Math.max(d.cost_usd > 0 ? 4 : 2, h)}px` }}
                title={`${d.day} · ${d.runs} runs · ${formatCost(d.cost_usd)}${
                  d.fix_proposed ? ` · ${d.fix_proposed} drafted` : ''
                }`}
              />
              <div
                className={`absolute -bottom-5 text-[10px] text-ink-500 tabular-nums ${
                  idx % labelEvery === 0 ? '' : 'opacity-0'
                }`}
              >
                {d.day.slice(8, 10)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-7 flex items-center gap-4 text-[11px] text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-accent-500/70" />
          drafted PR
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-ink-600" />
          triage / other
        </span>
      </div>
    </div>
  );
}
