import { fetchWizard } from "@/lib/wizard-api";
import { WizardPageClient } from "@/components/compliance/wizard/WizardPageClient";
import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ wizardId: string }>;
}

export default async function WizardDetailPage({ params }: Props) {
  const { wizardId } = await params;
  let wizard;
  try {
    wizard = await fetchWizard(wizardId);
  } catch {
    redirect("/compliance/wizards");
  }
  if (!wizard) redirect("/compliance/wizards");
  return <WizardPageClient wizard={wizard} />;
}
