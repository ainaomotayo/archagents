export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Overview</h1>
      <p className="text-slate-400">
        Welcome to the SENTINEL Dashboard. Select a section from the sidebar to
        get started.
      </p>

      {/* Placeholder cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Projects", value: "--" },
          { label: "Open Findings", value: "--" },
          { label: "Certificates Issued", value: "--" },
          { label: "Policies Active", value: "--" },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-slate-800 bg-slate-900 p-6"
          >
            <p className="text-sm text-slate-400">{card.label}</p>
            <p className="mt-2 text-2xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
