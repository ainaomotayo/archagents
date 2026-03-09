import { MOCK_AUDIT_LOG } from "@/lib/mock-data";

const ACTION_STYLES: Record<string, string> = {
  scan: "bg-blue-900/50 text-blue-300",
  certificate: "bg-green-900/50 text-green-300",
  revocation: "bg-red-900/50 text-red-300",
  policy: "bg-purple-900/50 text-purple-300",
  finding: "bg-yellow-900/50 text-yellow-300",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AuditLogPage() {
  const events = MOCK_AUDIT_LOG;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Audit Log</h1>
        <p className="mt-1 text-slate-400">
          Chronological record of all SENTINEL platform events.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-900 text-xs uppercase text-slate-400">
            <tr>
              <th scope="col" className="px-4 py-3">Timestamp</th>
              <th scope="col" className="px-4 py-3">Action</th>
              <th scope="col" className="px-4 py-3">Actor</th>
              <th scope="col" className="px-4 py-3">Resource</th>
              <th scope="col" className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {events.map((event) => (
              <tr key={event.id} className="bg-slate-950 text-slate-300">
                <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                  {formatDate(event.timestamp)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${ACTION_STYLES[event.action] ?? "bg-slate-700 text-slate-400"}`}
                  >
                    {event.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">{event.actor}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">
                  {event.resource}
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {event.details}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
