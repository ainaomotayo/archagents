export interface GitHubPRClient {
  createBranch(repo: string, baseBranch: string, branchName: string): Promise<string>;
  commitFile(repo: string, branch: string, path: string, content: string, message: string): Promise<string>;
  createPullRequest(repo: string, head: string, base: string, title: string, body: string, draft: boolean): Promise<{ html_url: string; number: number }>;
}

const FIX_STRATEGIES: Record<string, (finding: any) => { path: string; content: string; message: string } | null> = {
  dependency: (finding) => {
    const { packageName, fixedVersion, manifestPath } = finding.metadata ?? {};
    if (!fixedVersion || !manifestPath) return null;
    return {
      path: manifestPath,
      content: `// Auto-fix: upgrade ${packageName} to ${fixedVersion}`,
      message: `fix(deps): upgrade ${packageName} to ${fixedVersion}`,
    };
  },
};

export class AutoFixService {
  constructor(private db: any, private github: GitHubPRClient, private eventBus: any) {}

  async triggerAutoFix(orgId: string, remediationId: string, userId: string) {
    const item = await this.db.remediationItem.findUnique({ where: { id: remediationId } });
    if (!item || item.orgId !== orgId) throw new Error("Remediation item not found");
    if (!item.findingId) throw new Error("No linked finding for auto-fix");

    const finding = await this.db.finding.findUnique({ where: { id: item.findingId } });
    const strategy = FIX_STRATEGIES[finding?.type];
    const fix = strategy?.(finding);
    if (!fix) throw new Error("No auto-fix strategy available for this finding type");

    const branchName = `sentinel/fix/${remediationId.slice(0, 8)}`;
    const repo = finding.metadata?.repo ?? "unknown/repo";
    await this.github.createBranch(repo, "main", branchName);
    await this.github.commitFile(repo, branchName, fix.path, fix.content, fix.message);
    const pr = await this.github.createPullRequest(repo, branchName, "main", fix.message, `Auto-fix for ${item.title}\n\n[Sentinel] Remediation: ${remediationId}`, true);

    await this.db.remediationItem.update({
      where: { id: remediationId },
      data: { externalRef: `github:${repo}#${pr.number}` },
    });

    await this.eventBus.publish("sentinel.notifications", {
      id: `evt-${remediationId}-autofix`,
      orgId,
      topic: "remediation.auto_fix",
      payload: { remediationId, prUrl: pr.html_url, triggeredBy: userId },
      timestamp: new Date().toISOString(),
    });

    return { prUrl: pr.html_url, prNumber: pr.number, branch: branchName };
  }
}
