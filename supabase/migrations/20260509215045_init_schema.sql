-- Maintainer initial schema
-- Tables: repos, issues, runs, agent_steps, pull_requests
-- RLS: enabled on all tables. Owners (auth.uid() = repos.installed_by_user)
-- can read their own data. Service role bypasses RLS for the orchestrator.

-- Generic updated_at trigger function reused across tables.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================
-- repos: one row per maintained repository.
-- =========================================================
CREATE TABLE public.repos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  github_repo_id BIGINT,
  installation_id BIGINT,
  installed_by_user UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner, name)
);

CREATE INDEX repos_installed_by_user_idx ON public.repos (installed_by_user);

CREATE TRIGGER repos_set_updated_at
BEFORE UPDATE ON public.repos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- issues: GitHub issues plus Maintainer's triage state.
-- =========================================================
CREATE TABLE public.issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL REFERENCES public.repos(id) ON DELETE CASCADE,
  github_issue_number INTEGER NOT NULL,
  github_issue_id BIGINT,
  title TEXT NOT NULL,
  body TEXT,
  author_login TEXT,
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'closed')),
  labels TEXT[] NOT NULL DEFAULT '{}'::text[],
  triage_type TEXT CHECK (triage_type IN ('bug', 'feature', 'question', 'support', 'spam', 'not_actionable')),
  triage_severity TEXT CHECK (triage_severity IN ('critical', 'high', 'medium', 'low')),
  triage_scope TEXT CHECK (triage_scope IN ('scoped', 'multi-file', 'architectural', 'not-actionable')),
  triage_reproducible TEXT CHECK (triage_reproducible IN ('yes', 'no', 'partial')),
  triage_summary TEXT,
  triage_next_action TEXT,
  duplicates_of INTEGER[] NOT NULL DEFAULT '{}'::integer[],
  fixable BOOLEAN,
  triaged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (repo_id, github_issue_number)
);

CREATE INDEX issues_repo_state_idx ON public.issues (repo_id, state);
CREATE INDEX issues_fixable_idx ON public.issues (fixable) WHERE fixable IS NOT NULL;

CREATE TRIGGER issues_set_updated_at
BEFORE UPDATE ON public.issues
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- runs: one orchestrator run per webhook event or schedule.
-- =========================================================
CREATE TABLE public.runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL REFERENCES public.repos(id) ON DELETE CASCADE,
  issue_id UUID REFERENCES public.issues(id) ON DELETE SET NULL,
  trigger TEXT NOT NULL,
  trigger_payload JSONB,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed', 'rate_limited', 'budget_exhausted')),
  outcome TEXT
    CHECK (outcome IS NULL OR outcome IN ('triage_only', 'fix_proposed', 'fix_failed', 'no_action', 'duplicate', 'context_generated')),
  pr_id UUID,
  total_input_tokens INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0,
  total_cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  total_cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  total_runtime_ms INTEGER,
  github_run_id BIGINT,
  github_run_url TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX runs_repo_started_idx ON public.runs (repo_id, started_at DESC);
CREATE INDEX runs_issue_idx ON public.runs (issue_id) WHERE issue_id IS NOT NULL;
CREATE INDEX runs_status_idx ON public.runs (status);

-- =========================================================
-- agent_steps: each agent invocation within a run.
-- =========================================================
CREATE TABLE public.agent_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  agent TEXT NOT NULL
    CHECK (agent IN ('triager', 'reproducer', 'researcher', 'fixer', 'tester', 'reviewer', 'documenter', 'intent', 'learn', 'explain')),
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed', 'rate_limited', 'budget_exhausted')),
  input_summary TEXT,
  output_summary TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  tool_calls INTEGER NOT NULL DEFAULT 0,
  steps INTEGER NOT NULL DEFAULT 0,
  stop_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  UNIQUE (run_id, position)
);

CREATE INDEX agent_steps_run_idx ON public.agent_steps (run_id, position);
CREATE INDEX agent_steps_agent_idx ON public.agent_steps (agent);

-- =========================================================
-- pull_requests: PRs Maintainer drafted.
-- =========================================================
CREATE TABLE public.pull_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL REFERENCES public.repos(id) ON DELETE CASCADE,
  issue_id UUID REFERENCES public.issues(id) ON DELETE SET NULL,
  run_id UUID REFERENCES public.runs(id) ON DELETE SET NULL,
  github_pr_number INTEGER NOT NULL,
  github_pr_id BIGINT,
  title TEXT NOT NULL,
  branch TEXT NOT NULL,
  base_branch TEXT NOT NULL,
  files_changed TEXT[] NOT NULL DEFAULT '{}'::text[],
  additions INTEGER,
  deletions INTEGER,
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'closed', 'merged')),
  ready_for_review BOOLEAN NOT NULL DEFAULT false,
  merged BOOLEAN NOT NULL DEFAULT false,
  merged_at TIMESTAMPTZ,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (repo_id, github_pr_number)
);

CREATE INDEX pull_requests_issue_idx ON public.pull_requests (issue_id) WHERE issue_id IS NOT NULL;
CREATE INDEX pull_requests_run_idx ON public.pull_requests (run_id) WHERE run_id IS NOT NULL;
CREATE INDEX pull_requests_state_idx ON public.pull_requests (state);

CREATE TRIGGER pull_requests_set_updated_at
BEFORE UPDATE ON public.pull_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Now that pull_requests exists, link runs.pr_id to it.
ALTER TABLE public.runs
  ADD CONSTRAINT runs_pr_id_fkey
  FOREIGN KEY (pr_id) REFERENCES public.pull_requests(id) ON DELETE SET NULL;

-- =========================================================
-- Row Level Security
-- All tables RLS-enabled. Authenticated users see only their own
-- repos and the cascade of their data. The orchestrator uses the
-- service role and bypasses RLS for writes.
-- =========================================================

ALTER TABLE public.repos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pull_requests ENABLE ROW LEVEL SECURITY;

-- repos: owner-only
CREATE POLICY "repos: owner reads" ON public.repos
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = installed_by_user);

CREATE POLICY "repos: owner writes" ON public.repos
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = installed_by_user)
  WITH CHECK ((SELECT auth.uid()) = installed_by_user);

-- issues: visible if the parent repo is owned by the caller
CREATE POLICY "issues: owner reads" ON public.issues
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.repos r
      WHERE r.id = issues.repo_id
      AND r.installed_by_user = (SELECT auth.uid())
    )
  );

-- runs: same cascade
CREATE POLICY "runs: owner reads" ON public.runs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.repos r
      WHERE r.id = runs.repo_id
      AND r.installed_by_user = (SELECT auth.uid())
    )
  );

-- agent_steps: visible if the parent run's repo is owned by the caller
CREATE POLICY "agent_steps: owner reads" ON public.agent_steps
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.runs ru
      JOIN public.repos r ON r.id = ru.repo_id
      WHERE ru.id = agent_steps.run_id
      AND r.installed_by_user = (SELECT auth.uid())
    )
  );

-- pull_requests: owner reads
CREATE POLICY "pull_requests: owner reads" ON public.pull_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.repos r
      WHERE r.id = pull_requests.repo_id
      AND r.installed_by_user = (SELECT auth.uid())
    )
  );

-- Documentation comments
COMMENT ON TABLE public.repos IS 'One row per repository under Maintainer management.';
COMMENT ON TABLE public.issues IS 'GitHub issues plus the most recent Maintainer triage verdict.';
COMMENT ON TABLE public.runs IS 'A single orchestrator run, triggered by a webhook event or schedule.';
COMMENT ON TABLE public.agent_steps IS 'Individual agent invocations within a run. Position is the order of execution.';
COMMENT ON TABLE public.pull_requests IS 'Pull requests opened by Maintainer.';
