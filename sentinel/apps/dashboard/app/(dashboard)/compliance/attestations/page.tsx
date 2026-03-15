import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { getAttestations } from "@/lib/api";
import { AttestationListClient } from "@/components/compliance/AttestationListClient";
import { IconPlus } from "@/components/icons";

export default async function AttestationsPage() {
  const attestations = await getAttestations();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attestations"
        description="Manage control attestations and scan approvals"
        action={
          <Link
            href="/compliance/attestations/new"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-text-inverse transition-all hover:brightness-110 focus-ring"
          >
            <IconPlus className="h-4 w-4" />
            New Attestation
          </Link>
        }
      />
      <AttestationListClient attestations={attestations} />
    </div>
  );
}
