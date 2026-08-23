export default function TimelineLoading() {
  return (
    <div className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 pb-32 md:pt-10 md:pb-32" aria-label="Loading entries">
      <div className="h-12 w-48 animate-pulse rounded-xl bg-white/50" />
      <div className="space-y-4">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="aero-glass h-32 animate-pulse p-4" />
        ))}
      </div>
    </div>
  );
}
