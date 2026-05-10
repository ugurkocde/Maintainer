import { notFound } from 'next/navigation';
import { getRun } from '@/lib/db';
import { LiveRunDetail, type RunDetailData } from '@/app/components/LiveRunDetail';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Params = { params: Promise<{ id: string }> };

export default async function RunPage({ params }: Params) {
  const { id } = await params;
  const run = await getRun(id);
  if (!run) notFound();

  const initial: RunDetailData = {
    run,
    issue: run.issue,
    steps: run.agent_steps,
    pull_request: run.pull_request,
    repo: run.repo,
  };

  return <LiveRunDetail initial={initial} />;
}
