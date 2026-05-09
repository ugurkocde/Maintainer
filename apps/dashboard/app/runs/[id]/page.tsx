import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRun, type AgentStep } from '@/lib/db';
import {
  agentColor,
  formatCost,
  formatDuration,
  formatRelativeTime,
  formatTokens,
  outcomeColor,
  statusColor,
} from '@/lib/format';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Params = { params: Promise<{ id: string }> };

export default async function RunPage({ params }: Params) {
  const { id } = await params;
  const run = await getRun(id);
  if (!run) notFound();

  return (
    <div className="space-y-6">
      <nav className="text-sm text-ink-400">
        <Link href="/" className="hover:text-ink-100">repos</Link>
        <span className="mx-2">/</span>
        <span>run {run.id.slice(0, 8)}</span>
      </nav>

      <header className="space-y-3">
        <div className="flex items-center gap-3 text-xs">
          <span
            className={`inline-flex items-center rounded border px-2 py-0.5 font-medium ${statusColor(run.status)}`}
          >
            {run.status}
          </span>
          {run.outcome && (
            <span className={`inline-flex items-center rounded px-2 py-0.5 ${outcomeColor(run.outcome)}`}>
              {run.outcome}
            </span>
          )}
          <span className="text-ink-500">{run.trigger}</span>
          <span className="text-ink-500">·</span>
          <span className="text-ink-500">{formatRelativeTime(run.started_at)}</span>
          {run.github_run_url && (
            <>
              <span className="text-ink-500">·</span>
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
        <h1 className="text-xl font-semibold">
          {run.issue ? (
            <>
              <span className="text-ink-500">#{run.issue.github_issue_number}</span>{' '}
              {run.issue.title}
            </>
          ) : (
            <>Run {run.id.slice(0, 8)}</>
          )}
        </h1>
        {run.pull_request && (
          <p className="text-sm text-ink-400">
            Drafted{' '}
            <a
              href={run.pull_request.url}
              className="text-accent-500 hover:text-accent-600"
              target="_blank"
              rel="noopener noreferrer"
            >
              PR #{run.pull_request.github_pr_number}
            </a>
            {' '}
            · {run.pull_request.files_changed.length} file{run.pull_request.files_changed.length === 1 ? '' : 's'}
            {' '}
            · branch <code className="text-ink-300">{run.pull_request.branch}</code>
          </p>
        )}
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Cost" value={formatCost(run.total_cost_usd)} />
        <Stat label="Runtime" value={formatDuration(run.total_runtime_ms)} />
        <Stat label="Input" value={formatTokens(run.total_input_tokens + (run.total_cache_read_tokens ?? 0) + (run.total_cache_creation_tokens ?? 0))} />
        <Stat label="Output" value={formatTokens(run.total_output_tokens)} />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-ink-300 mb-3">Agent timeline</h2>
        <ol className="relative space-y-3 border-l border-ink-700/60 pl-5">
          {run.agent_steps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
        </ol>
      </section>

      {run.issue && (
        <section className="rounded-lg border border-ink-700/60 bg-ink-800/30 p-4 space-y-2">
          <h2 className="text-sm font-semibold text-ink-300">Triage verdict</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Field label="Type" value={run.issue.triage_type} />
            <Field label="Severity" value={run.issue.triage_severity} />
            <Field label="Scope" value={run.issue.triage_scope} />
            <Field label="Reproducible" value={run.issue.triage_reproducible} />
          </dl>
          {run.issue.triage_summary && (
            <p className="mt-3 text-sm text-ink-200 whitespace-pre-line">{run.issue.triage_summary}</p>
          )}
          {run.issue.triage_next_action && (
            <p className="mt-2 text-sm text-ink-300 italic whitespace-pre-line">
              Next: {run.issue.triage_next_action}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-700/60 bg-ink-800/30 p-4">
      <div className="text-xs text-ink-500">{label}</div>
      <div className="mt-1 font-medium tabular-nums">{value}</div>
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
  return (
    <li className="relative">
      <span className="absolute -left-[26px] top-1.5 h-2 w-2 rounded-full bg-accent-500" />
      <div className="rounded-lg border border-ink-700/60 bg-ink-800/30 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-ink-500">#{step.position}</span>
            <span className={`font-semibold ${agentColor(step.agent)}`}>{step.agent}</span>
            <span className="text-ink-500 text-xs">{step.model}</span>
            <span
              className={`inline-flex items-center rounded border px-2 py-0.5 text-xs ${statusColor(step.status)}`}
            >
              {step.status}
            </span>
          </div>
          <div className="text-right text-xs text-ink-500 tabular-nums">
            <div>{formatCost(step.cost_usd)}</div>
            <div>
              {formatTokens(step.input_tokens + step.cache_creation_tokens + step.cache_read_tokens)} in /
              {' '}
              {formatTokens(step.output_tokens)} out
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
