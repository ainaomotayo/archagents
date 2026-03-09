"use client";

export interface ValidationMessage {
  level: "error" | "warning" | "info";
  line: number | null;
  message: string;
}

interface PolicyValidatorProps {
  messages: ValidationMessage[];
}

const LEVEL_STYLES: Record<
  ValidationMessage["level"],
  { bg: string; text: string; label: string }
> = {
  error: {
    bg: "bg-red-900/30 border-red-800",
    text: "text-red-300",
    label: "Error",
  },
  warning: {
    bg: "bg-yellow-900/30 border-yellow-800",
    text: "text-yellow-300",
    label: "Warning",
  },
  info: {
    bg: "bg-blue-900/30 border-blue-800",
    text: "text-blue-300",
    label: "Info",
  },
};

/**
 * Displays real-time validation results for a SENTINEL policy.
 */
export function PolicyValidator({ messages }: PolicyValidatorProps) {
  if (messages.length === 0) {
    return (
      <div className="rounded-lg border border-green-800 bg-green-900/20 px-4 py-3">
        <p className="text-sm text-green-300">
          Policy is valid — no issues found.
        </p>
      </div>
    );
  }

  const errors = messages.filter((m) => m.level === "error").length;
  const warnings = messages.filter((m) => m.level === "warning").length;

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center gap-4 text-sm">
        {errors > 0 && (
          <span className="text-red-400">
            {errors} error{errors !== 1 ? "s" : ""}
          </span>
        )}
        {warnings > 0 && (
          <span className="text-yellow-400">
            {warnings} warning{warnings !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Message list */}
      <div className="space-y-2">
        {messages.map((msg, i) => {
          const style = LEVEL_STYLES[msg.level];
          return (
            <div
              key={`${msg.level}-${msg.line}-${i}`}
              className={`rounded border px-4 py-2 ${style.bg}`}
            >
              <div className="flex items-center gap-2 text-xs">
                <span className={`font-semibold uppercase ${style.text}`}>
                  {style.label}
                </span>
                {msg.line !== null && (
                  <span className="text-slate-400">Line {msg.line}</span>
                )}
              </div>
              <p className={`mt-1 text-sm ${style.text}`}>{msg.message}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Parse a YAML policy string and return validation messages.
 *
 * This is a lightweight heuristic validator — not a full YAML parser.
 * It checks for common SENTINEL policy structure issues.
 */
export function validatePolicy(yaml: string): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const lines = yaml.split("\n");

  if (yaml.trim().length === 0) {
    messages.push({
      level: "error",
      line: null,
      message: "Policy document is empty.",
    });
    return messages;
  }

  // Check for required top-level keys
  const requiredKeys = ["version", "rules"];
  for (const key of requiredKeys) {
    const pattern = new RegExp(`^${key}\\s*:`, "m");
    if (!pattern.test(yaml)) {
      messages.push({
        level: "error",
        line: null,
        message: `Missing required top-level key: "${key}".`,
      });
    }
  }

  // Check for tab characters (YAML should use spaces)
  lines.forEach((line, i) => {
    if (line.includes("\t")) {
      messages.push({
        level: "error",
        line: i + 1,
        message: "Tab character detected — YAML requires spaces for indentation.",
      });
    }
  });

  // Warn on lines with trailing whitespace
  lines.forEach((line, i) => {
    if (line.length > 0 && line !== line.trimEnd()) {
      messages.push({
        level: "warning",
        line: i + 1,
        message: "Trailing whitespace detected.",
      });
    }
  });

  // Info: check for severity thresholds
  if (yaml.includes("severity") && !yaml.includes("threshold")) {
    messages.push({
      level: "info",
      line: null,
      message:
        'Consider adding a "threshold" field alongside severity rules to control enforcement levels.',
    });
  }

  return messages;
}
