import { getComplianceScores, getCertificates } from "@/lib/api";
import { AttestationFormClient } from "@/components/compliance/AttestationFormClient";

export default async function NewAttestationPage() {
  const [frameworks, certificates] = await Promise.all([
    getComplianceScores(),
    getCertificates(),
  ]);

  return <AttestationFormClient frameworks={frameworks} certificates={certificates} />;
}
