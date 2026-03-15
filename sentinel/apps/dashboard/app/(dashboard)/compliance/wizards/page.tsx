import { fetchWizards } from "@/lib/wizard-api";
import { WizardListClient } from "@/components/compliance/wizard/WizardListClient";

export default async function WizardsPage() {
  let wizards: any[] = [];
  try {
    wizards = await fetchWizards();
  } catch {
    // API not available
  }
  return <WizardListClient wizards={wizards} />;
}
