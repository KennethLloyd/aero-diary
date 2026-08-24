import Link from 'next/link';
import { AeroButton } from '@/components/aero/AeroButton';

export function RecoveryState({
  title,
  message,
  actionHref = '/timeline/new',
  actionLabel = 'New entry',
  secondaryHref = '/timeline',
  secondaryLabel = 'Back to timeline',
  onRetry,
}: {
  title: string
  message: string
  actionHref?: string
  actionLabel?: string
  secondaryHref?: string
  secondaryLabel?: string
  onRetry?: () => void
}) {
  return (
    <section className="recovery-state aero-card mx-auto w-full max-w-lg p-6 text-center">
      <h1 className="text-2xl font-bold text-[#0a2f5c]">{title}</h1>
      <p className="mt-2 text-sm font-semibold leading-relaxed text-[#2b4c73]">{message}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {onRetry ? <AeroButton type="button" onClick={onRetry}>Try again</AeroButton> : null}
        <AeroButton href={actionHref}>{actionLabel}</AeroButton>
        <Link href={secondaryHref} className="aero-btn aero-btn-white">{secondaryLabel}</Link>
      </div>
    </section>
  );
}
