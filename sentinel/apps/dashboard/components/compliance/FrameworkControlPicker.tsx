import type { FrameworkScore } from "./types";

interface FrameworkControlPickerProps {
  frameworks: FrameworkScore[];
  frameworkSlug: string;
  controlCode: string;
  onFrameworkChange: (slug: string) => void;
  onControlChange: (code: string) => void;
}

export function FrameworkControlPicker({
  frameworks,
  frameworkSlug,
  controlCode,
  onFrameworkChange,
  onControlChange,
}: FrameworkControlPickerProps) {
  const selectedFw = frameworks.find((fw) => fw.frameworkSlug === frameworkSlug);
  const controls = selectedFw?.controlScores ?? [];

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="text-[12px] font-semibold text-text-secondary">
          Framework
        </label>
        <select
          value={frameworkSlug}
          onChange={(e) => {
            onFrameworkChange(e.target.value);
            onControlChange("");
          }}
          className="mt-1 w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-[13px] text-text-primary focus-ring"
        >
          <option value="">Select framework...</option>
          {frameworks.map((fw) => (
            <option key={fw.frameworkSlug} value={fw.frameworkSlug}>
              {fw.frameworkName}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-[12px] font-semibold text-text-secondary">
          Control
        </label>
        <select
          value={controlCode}
          onChange={(e) => onControlChange(e.target.value)}
          disabled={!frameworkSlug}
          className="mt-1 w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-[13px] text-text-primary focus-ring disabled:opacity-50"
        >
          <option value="">Select control...</option>
          {controls.map((ctrl) => (
            <option key={ctrl.controlCode} value={ctrl.controlCode}>
              {ctrl.controlCode} -- {ctrl.controlName}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
