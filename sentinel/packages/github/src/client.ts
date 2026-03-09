import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { createHmac, timingSafeEqual } from "node:crypto";

let appId: string | undefined;
let privateKey: string | undefined;

export function configureGitHubApp(opts: {
  appId: string;
  privateKey: string;
}): void {
  appId = opts.appId;
  privateKey = opts.privateKey;
}

export function isGitHubAppConfigured(): boolean {
  return !!appId && !!privateKey;
}

export function getInstallationOctokit(installationId: number): Octokit {
  if (!appId || !privateKey) {
    throw new Error("GitHub App not configured. Set GITHUB_APP_ID and GITHUB_PRIVATE_KEY.");
  }
  return new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey, installationId },
  });
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
