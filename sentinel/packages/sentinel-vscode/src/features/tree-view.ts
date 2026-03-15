import * as vscode from "vscode";
import type { SentinelContext, Severity } from "../context.js";
import { severityOrder } from "../context.js";

interface Finding {
  id: string;
  severity: string;
  title: string | null;
  description: string | null;
  category: string | null;
  file: string;
  lineStart: number;
  lineEnd: number;
  agentName: string;
  confidence: number;
  cweId: string | null;
  [key: string]: unknown;
}

const severityIcons: Record<string, string> = {
  critical: "error",
  high: "warning",
  medium: "info",
  low: "debug-stackframe-dot",
  info: "lightbulb",
};

export class SeverityGroup extends vscode.TreeItem {
  constructor(public readonly severity: string, public readonly count: number) {
    super(`${severity.charAt(0).toUpperCase() + severity.slice(1)} (${count})`, vscode.TreeItemCollapsibleState.Expanded);
    this.iconPath = new vscode.ThemeIcon(severityIcons[severity] ?? "circle");
    this.contextValue = "severityGroup";
  }
}

export class FindingItem extends vscode.TreeItem {
  constructor(public readonly finding: Finding) {
    const label = finding.title ?? finding.category ?? "Unknown finding";
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = `${finding.file}:${finding.lineStart}`;
    this.tooltip = new vscode.MarkdownString(
      `**${label}**\n\nAgent: \`${finding.agentName}\` | Confidence: ${Math.round(finding.confidence * 100)}%`,
    );
    this.iconPath = new vscode.ThemeIcon(severityIcons[finding.severity] ?? "circle");
    this.contextValue = "finding";

    this.command = {
      command: "sentinel.showFindingDetail",
      title: "Show Finding Detail",
      arguments: [finding],
    };

    this.resourceUri = vscode.Uri.file(finding.file);
  }
}

type TreeNode = SeverityGroup | FindingItem;

export class FindingsTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private findings: Finding[] = [];
  private threshold: Severity = "info";
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  get totalCount(): number {
    return this.getFilteredFindings().length;
  }

  updateFindings(findings: Finding[]): void {
    this.findings = findings;
    this._onDidChangeTreeData.fire();
  }

  setSeverityThreshold(threshold: Severity): void {
    this.threshold = threshold;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      return this.getRootGroups();
    }
    if (element instanceof SeverityGroup) {
      return this.getFindingsForSeverity(element.severity);
    }
    return [];
  }

  private getFilteredFindings(): Finding[] {
    const thresholdNum = severityOrder[this.threshold] ?? 4;
    return this.findings.filter(
      (f) => (severityOrder[f.severity as Severity] ?? 4) <= thresholdNum,
    );
  }

  private getRootGroups(): SeverityGroup[] {
    const filtered = this.getFilteredFindings();
    const groups = new Map<string, number>();
    for (const f of filtered) {
      groups.set(f.severity, (groups.get(f.severity) ?? 0) + 1);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => (severityOrder[a as Severity] ?? 4) - (severityOrder[b as Severity] ?? 4))
      .map(([sev, count]) => new SeverityGroup(sev, count));
  }

  private getFindingsForSeverity(severity: string): FindingItem[] {
    return this.getFilteredFindings()
      .filter((f) => f.severity === severity)
      .sort((a, b) => b.confidence - a.confidence)
      .map((f) => new FindingItem(f));
  }
}

export function activateTreeView(ctx: SentinelContext): FindingsTreeProvider {
  const provider = new FindingsTreeProvider();
  const treeView = vscode.window.createTreeView("sentinelFindings", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  ctx.subscriptions.push(treeView);
  return provider;
}
