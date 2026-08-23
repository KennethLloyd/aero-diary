'use client';

import { useRouter } from 'next/navigation';

export function EntryBackButton() {
  const router = useRouter();

  function goBack() {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/timeline');
    }
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className="aero-link-control flex items-center gap-1 text-sm font-bold text-[#144e9d] drop-shadow-md hover:underline"
    >
      <span className="text-lg" aria-hidden="true">&lsaquo;</span>
      <span>Back</span>
    </button>
  );
}
