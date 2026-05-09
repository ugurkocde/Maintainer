import { describe, it, expect } from 'vitest';
import { renderStatus, type RepoSnapshot } from '../src/dashboard/render.js';

describe('renderStatus', () => {
  it('produces valid markdown for one repo', () => {
    const snapshot: RepoSnapshot = {
      slug: 'octocat/hello',
      open: 12,
      opened_this_week: 3,
      closed_this_week: 5,
      stale: 2,
      needs_repro: 1,
      fix_proposed: 4,
      needs_human: 0,
      agent_pr_open: 4,
      agent_pr_merged_total: 11,
      top_issues: [
        {
          number: 42,
          title: 'Crash on launch',
          url: 'https://github.com/octocat/hello/issues/42',
          reactions: 8,
          age_days: 5,
        },
      ],
    };

    const md = renderStatus([snapshot], new Date('2026-05-09T00:00:00Z'));
    expect(md).toContain('# Maintainer status');
    expect(md).toContain('octocat/hello');
    expect(md).toContain('Crash on launch');
    expect(md).toContain('| Repository |');
  });

  it('handles no repos gracefully', () => {
    const md = renderStatus([], new Date());
    expect(md).toContain('Maintainer status');
    expect(md).toContain('No standout issues');
  });
});
