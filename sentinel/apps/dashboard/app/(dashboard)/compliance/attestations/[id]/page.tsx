import { getAttestationById, getAuditLog } from "@/lib/api";
import { AttestationDetailClient } from "@/components/compliance/AttestationDetailClient";
import { notFound } from "next/navigation";

export default async function AttestationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const attestation = await getAttestationById(id);
  if (!attestation) notFound();

  const auditEvents = await getAuditLog();

  return (
    <AttestationDetailClient
      attestation={attestation}
      auditEvents={auditEvents}
    />
  );
}
