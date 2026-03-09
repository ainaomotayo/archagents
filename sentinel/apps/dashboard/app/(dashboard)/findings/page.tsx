import Link from "next/link";
import { getFindings } from "@/lib/api";
import { FindingCard } from "@/components/finding-card";

export default async function FindingsPage() {
  const findings = await getFindings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Findings</h1>
        <p className="mt-1 text-slate-400">
          Security findings across all monitored projects.
        </p>
      </div>

      <div className="grid gap-4">
        {findings.map((finding) => (
          <Link
            key={finding.id}
            href={`/dashboard/findings/${finding.id}`}
            className="block transition-opacity hover:opacity-90"
            aria-label={`View finding: ${finding.title}`}
          >
            <FindingCard finding={finding} />
          </Link>
        ))}
      </div>
    </div>
  );
}
