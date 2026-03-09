export default function Loading() {
  return (
    <div className="space-y-8">
      <div>
        <div className="skeleton h-8 w-48" />
        <div className="skeleton mt-3 h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface-1 p-5">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton mt-4 h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-surface-1 p-1">
        <div className="skeleton h-4 w-full rounded-t-lg" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="skeleton mt-1 h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
