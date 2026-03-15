import type { AttestationType } from "./attestation-types";

interface AttestationTypeSelectorProps {
  value: AttestationType;
  onChange: (type: AttestationType) => void;
}

const OPTIONS: { value: AttestationType; label: string; description: string }[] = [
  {
    value: "manual",
    label: "Manual Control",
    description: "Attest to a control that automated scanning cannot verify",
  },
  {
    value: "scan_approval",
    label: "Scan Approval",
    description: "Review and approve automated scan results",
  },
];

export function AttestationTypeSelector({ value, onChange }: AttestationTypeSelectorProps) {
  return (
    <fieldset>
      <legend className="text-[12px] font-semibold text-text-secondary mb-2">
        Attestation Type
      </legend>
      <div className="flex gap-3">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 rounded-lg border p-3 text-left transition-all ${
              value === opt.value
                ? "border-accent bg-accent-subtle"
                : "border-border bg-surface-1 hover:bg-surface-2"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                  value === opt.value
                    ? "border-accent"
                    : "border-text-tertiary"
                }`}
              >
                {value === opt.value && (
                  <span className="h-2 w-2 rounded-full bg-accent" />
                )}
              </span>
              <span className="text-[13px] font-semibold text-text-primary">
                {opt.label}
              </span>
            </div>
            <p className="mt-1 pl-6 text-[11px] text-text-tertiary">
              {opt.description}
            </p>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
