export default function EntryDetailLoading() {
  return (
    <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 pb-32 md:pt-10 md:pb-32" aria-label="Loading entry">
      <div className="h-8 w-24 animate-pulse rounded-xl bg-white/50" />
      <div className="aero-glass h-96 animate-pulse p-5" />
    </main>
  );
}
