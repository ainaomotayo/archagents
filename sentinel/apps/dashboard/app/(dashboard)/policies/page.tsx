import Link from "next/link";
import { MOCK_POLICIES } from "@/lib/mock-data";

export default function PoliciesPage() {
  const policies = MOCK_POLICIES;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Policies</h1>
          <p className="mt-1 text-slate-400">
            Manage SENTINEL scanning and compliance policies.
          </p>
        </div>
        <Link
          href="/dashboard/policies/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Policy
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-900 text-xs uppercase text-slate-400">
            <tr>
              <th scope="col" className="px-4 py-3">
                Name
              </th>
              <th scope="col" className="px-4 py-3">
                Status
              </th>
              <th scope="col" className="px-4 py-3">
                Rules
              </th>
              <th scope="col" className="px-4 py-3">
                Updated
              </th>
              <th scope="col" className="px-4 py-3">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {policies.map((policy) => (
              <tr key={policy.id} className="bg-slate-950 text-slate-300">
                <td className="px-4 py-3 font-medium text-white">
                  {policy.name}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      policy.enabled
                        ? "bg-green-900/50 text-green-300"
                        : "bg-slate-700 text-slate-400"
                    }`}
                  >
                    {policy.enabled ? "Active" : "Disabled"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {policy.ruleCount} rules
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {new Date(policy.updatedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/policies/${policy.id}`}
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
