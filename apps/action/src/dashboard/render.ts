export type RepoSnapshot = {
  slug: string;
  open: number;
  opened_this_week: number;
  closed_this_week: number;
  stale: number;
  needs_repro: number;
  fix_proposed: number;
  needs_human: number;
  agent_pr_open: number;
  agent_pr_merged_total: number;
  top_issues: TopIssue[];
};

export type TopIssue = {
  number: number;
  title: string;
  url: string;
  reactions: number;
  severity?: string;
  age_days: number;
};

export function renderStatus(snapshots: RepoSnapshot[], generatedAt: Date): string {
  const total = snapshots.reduce(
    (acc, s) => ({
      open: acc.open + s.open,
      opened: acc.opened + s.opened_this_week,
      closed: acc.closed + s.closed_this_week,
      stale: acc.stale + s.stale,
      fixProposed: acc.fixProposed + s.fix_proposed,
    }),
    { open: 0, opened: 0, closed: 0, stale: 0, fixProposed: 0 },
  );

  const lines: string[] = [];
  lines.push('# Maintainer status');
  lines.push('');
  lines.push(`_Generated ${generatedAt.toISOString()} UTC_`);
  lines.push('');
  lines.push('## Totals');
  lines.push('');
  lines.push(`- Open issues: **${total.open}**`);
  lines.push(`- Opened this week: ${total.opened}`);
  lines.push(`- Closed this week: ${total.closed}`);
  lines.push(`- Stale: ${total.stale}`);
  lines.push(`- Draft fix PRs awaiting review: ${total.fixProposed}`);
  lines.push('');
  lines.push('## By repository');
  lines.push('');
  lines.push('| Repository | Open | New (7d) | Closed (7d) | Stale | Draft PRs | Needs human |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const s of snapshots) {
    lines.push(
      `| [${s.slug}](https://github.com/${s.slug}/issues) | ${s.open} | ${s.opened_this_week} | ${s.closed_this_week} | ${s.stale} | ${s.fix_proposed} | ${s.needs_human} |`,
    );
  }
  lines.push('');
  lines.push('## Top issues to focus on');
  lines.push('');

  const top = snapshots
    .flatMap((s) => s.top_issues.map((it) => ({ ...it, repo: s.slug })))
    .sort((a, b) => b.reactions - a.reactions || a.age_days - b.age_days)
    .slice(0, 10);

  if (top.length === 0) {
    lines.push('_No standout issues this week._');
  } else {
    for (const it of top) {
      lines.push(
        `- [${it.repo}#${it.number}](${it.url}) ${it.title} _(${it.reactions} reactions, ${it.age_days}d old)_`,
      );
    }
  }
  lines.push('');
  return lines.join('\n');
}
