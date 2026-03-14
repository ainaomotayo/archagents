import micromatch from "micromatch";
import { DecisionTraceService } from "./service.js";

export interface DeclaredTool {
  name: string;
  model?: string;
  scope?: string;
}

export interface SentinelAIConfig {
  tools: DeclaredTool[];
}

/**
 * Parse .sentinel-ai.yml content (already parsed as object from scan metadata).
 * Accepts the raw metadata object; returns empty config if missing or malformed.
 */
export function parseSentinelAIConfig(
  metadata: unknown,
): SentinelAIConfig {
  if (!metadata || typeof metadata !== "object") return { tools: [] };
  const meta = metadata as Record<string, unknown>;

  // Accept sentinelAi or sentinel_ai key
  const raw = meta.sentinelAi ?? meta.sentinel_ai ?? meta;
  if (!raw || typeof raw !== "object") return { tools: [] };

  const config = raw as Record<string, unknown>;
  if (!Array.isArray(config.tools)) return { tools: [] };

  return {
    tools: config.tools
      .filter((t: any) => t && typeof t.name === "string")
      .map((t: any) => ({
        name: t.name,
        model: typeof t.model === "string" ? t.model : undefined,
        scope: typeof t.scope === "string" ? t.scope : undefined,
      })),
  };
}

/**
 * Also support CI environment variables:
 * SENTINEL_AI_TOOL and SENTINEL_AI_MODEL
 */
export function configFromEnvVars(
  envVars: Record<string, string | undefined>,
): SentinelAIConfig {
  const tool = envVars.SENTINEL_AI_TOOL;
  if (!tool) return { tools: [] };
  return {
    tools: [
      {
        name: tool,
        model: envVars.SENTINEL_AI_MODEL ?? undefined,
        scope: "**",
      },
    ],
  };
}

/**
 * Find the best matching declared tool for a given file path.
 */
export function matchDeclaredTool(
  filePath: string,
  config: SentinelAIConfig,
): DeclaredTool | null {
  for (const tool of config.tools) {
    const scope = tool.scope ?? "**";
    if (micromatch.isMatch(filePath, scope)) {
      return tool;
    }
  }
  return null;
}

/**
 * Enrich all decision traces for a scan with pre-declared metadata.
 * Best-effort: errors are logged but don't fail the scan.
 */
export async function enrichTracesForScan(
  db: any,
  scanId: string,
  scanMetadata: unknown,
  envVars?: Record<string, string | undefined>,
): Promise<number> {
  // Build config from metadata or env vars
  let config = parseSentinelAIConfig(scanMetadata);
  if (config.tools.length === 0 && envVars) {
    config = configFromEnvVars(envVars);
  }
  if (config.tools.length === 0) return 0;

  // Get all AI detector findings for this scan
  const findings = await db.finding.findMany({
    where: { scanId, agentName: "ai-detector" },
    select: { id: true, file: true },
  });

  const traceService = new DecisionTraceService(db);
  let enriched = 0;

  for (const finding of findings) {
    const match = matchDeclaredTool(finding.file, config);
    if (match) {
      try {
        await traceService.enrichWithDeclared(
          finding.id,
          match.name,
          match.model ?? "",
        );
        enriched++;
      } catch {
        // Best-effort
      }
    }
  }

  return enriched;
}
