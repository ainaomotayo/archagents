import {
  Diagnostic,
  DiagnosticSeverity,
  CodeAction,
  CodeActionKind,
  CodeLens,
  Command,
  Range,
} from "vscode-languageserver";
import type { SentinelFinding } from "./types.js";

const severityMap: Record<SentinelFinding["severity"], DiagnosticSeverity> = {
  critical: DiagnosticSeverity.Error,
  high: DiagnosticSeverity.Error,
  medium: DiagnosticSeverity.Warning,
  low: DiagnosticSeverity.Information,
  info: DiagnosticSeverity.Hint,
};

const severityOrder: Record<SentinelFinding["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export class DiagnosticMapper {
  toDiagnostic(finding: SentinelFinding): Diagnostic {
    const range: Range = {
      start: { line: finding.lineStart - 1, character: 0 },
      end: { line: finding.lineEnd - 1, character: Number.MAX_VALUE },
    };

    const diag = Diagnostic.create(
      range,
      finding.title ?? finding.description ?? finding.category ?? "Unknown finding",
      severityMap[finding.severity],
      finding.cweId ?? finding.category ?? undefined,
      `sentinel/${finding.agentName}`,
    );
    diag.data = { findingId: finding.id };
    return diag;
  }

  toCodeActions(finding: SentinelFinding): CodeAction[] {
    const title = finding.title ?? finding.description ?? finding.category ?? "finding";

    const diagnostic = this.toDiagnostic(finding);

    const suppressAction: CodeAction = {
      title: `Suppress: ${title}`,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      command: Command.create(
        `Suppress: ${title}`,
        "sentinel.suppress",
        finding.id,
      ),
    };

    const viewAction: CodeAction = {
      title: "View in Sentinel Dashboard",
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      command: Command.create(
        "View in Sentinel Dashboard",
        "sentinel.openDashboard",
        finding.id,
      ),
    };

    return [suppressAction, viewAction];
  }

  toCodeLenses(findings: SentinelFinding[]): CodeLens[] {
    const groups = new Map<number, SentinelFinding[]>();

    for (const finding of findings) {
      const line = finding.lineStart;
      const group = groups.get(line);
      if (group) {
        group.push(finding);
      } else {
        groups.set(line, [finding]);
      }
    }

    const lenses: CodeLens[] = [];

    for (const [line, group] of groups) {
      const maxSeverity = group.reduce<SentinelFinding["severity"]>(
        (max, f) => (severityOrder[f.severity] < severityOrder[max] ? f.severity : max),
        group[0].severity,
      );

      const range: Range = {
        start: { line: line - 1, character: 0 },
        end: { line: line - 1, character: 0 },
      };

      lenses.push({
        range,
        command: Command.create(
          `$(warning) ${group.length} Sentinel finding(s) (${maxSeverity})`,
          "sentinel.showFindings",
          group.map((f) => f.id),
        ),
      });
    }

    return lenses;
  }
}
