export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 animate-pulse rounded bg-[var(--muted)]" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-[var(--muted)]" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg bg-[var(--muted)]" />
    </div>
  );
}
