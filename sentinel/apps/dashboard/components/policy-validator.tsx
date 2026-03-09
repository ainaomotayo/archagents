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
    bg: "bg-status-fail/10 border-status-fail/30",
    text: "text-status-fail",
    label: "Error",
  },
  warning: {
    bg: "bg-status-warn/10 border-status-warn/30",
    text: "text-status-warn",
    label: "Warning",
  },
  info: {
    bg: "bg-status-info/10 border-status-info/30",
    text: "text-status-info",
    label: "Info",
  },
};

export function PolicyValidator({ messages }: PolicyValidatorProps) {
  if (messages.length === 0) {
    return (
      <div className="rounded-xl border border-status-pass/30 bg-status-pass/10 px-4 py-3">
        <p className="text-[13px] text-status-pass">
          Policy is valid \u2014 no issues found.
        </p>
      </div>
    );
  }

  const errors = messages.filter((m) => m.level === "error").length;
  const warnings = messages.filter((m) => m.level === "warning").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-[11px] font-semibold">
        {errors > 0 && (
          <span className="text-status-fail">
            {errors} error{errors !== 1 ? "s" : ""}
          </span>
        )}
        {warnings > 0 && (
          <span className="text-status-warn">
            {warnings} warning{warnings !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {messages.map((msg, i) => {
          const style = LEVEL_STYLES[msg.level];
          return (
            <div
              key={`${msg.level}-${msg.line}-${i}`}
              className={`rounded-lg border px-4 py-2.5 ${style.bg}`}
            >
              <div className="flex items-center gap-2 text-[10px]">
                <span className={`font-bold uppercase tracking-wider ${style.text}`}>
                  {style.label}
                </span>
                {msg.line !== null && (
                  <span className="text-text-tertiary">Line {msg.line}</span>
                )}
              </div>
              <p className={`mt-1 text-[13px] ${style.text}`}>{msg.message}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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

  lines.forEach((line, i) => {
    if (line.includes("\t")) {
      messages.push({
        level: "error",
        line: i + 1,
        message: "Tab character detected \u2014 YAML requires spaces for indentation.",
      });
    }
  });

  lines.forEach((line, i) => {
    if (line.length > 0 && line !== line.trimEnd()) {
      messages.push({
        level: "warning",
        line: i + 1,
        message: "Trailing whitespace detected.",
      });
    }
  });

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
