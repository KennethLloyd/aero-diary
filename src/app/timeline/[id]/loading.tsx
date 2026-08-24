export default function EntryDetailLoading() {
  return (
    <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 md:pt-10" aria-label="Loading entry">
      <p className="text-sm font-semibold text-[#2b4c73]">Loading memory…</p>
      <div className="aero-card h-96 animate-pulse p-5" />
    </main>
  );
}
