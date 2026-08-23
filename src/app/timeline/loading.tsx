export default function TimelineLoading() {
  return (
    <div className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 md:pt-10" aria-label="Loading entries">
      <p className="text-sm font-semibold text-[#2b4c73]">Loading your timeline…</p>
      <div className="space-y-4">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="aero-glass h-32 animate-pulse p-4" />
        ))}
      </div>
    </div>
  );
}
