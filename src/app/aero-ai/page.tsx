import { notFound } from 'next/navigation';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroScreen } from '@/components/aero/AeroScreen';
import { AeroAiClient } from '@/components/aero-ai/AeroAiClient';
import { isPrivateAeroAiUser } from '@/lib/aero-ai/access';
import { verifySession } from '@/lib/dal';

type AeroAiPageProps = {
  searchParams: Promise<{ thread?: string | string[] }>
}

export default async function AeroAiPage({ searchParams }: AeroAiPageProps) {
  const session = await verifySession();
  if (!(await isPrivateAeroAiUser(session.userId))) notFound();
  const params = await searchParams;
  const initialThreadId = Array.isArray(params.thread) ? params.thread[0] : params.thread;

  return (
    <>
      <AeroBubbles />
      <AeroScreen>
        <AeroAiClient initialThreadId={initialThreadId} />
      </AeroScreen>
    </>
  );
}
