import type { BlockPlugin } from "./types";

// ---------------------------------------------------------------------------
// Condition plugins
// ---------------------------------------------------------------------------
import { severityConditionPlugin } from "./severity-condition";
import { categoryConditionPlugin } from "./category-condition";
import { riskScoreConditionPlugin } from "./risk-score-condition";
import { branchConditionPlugin } from "./branch-condition";
import { licenseConditionPlugin } from "./license-condition";

// ---------------------------------------------------------------------------
// Group plugins
// ---------------------------------------------------------------------------
import { andGroupPlugin } from "./and-group";
import { orGroupPlugin } from "./or-group";
import { notGroupPlugin } from "./not-group";

// ---------------------------------------------------------------------------
// Action plugins
// ---------------------------------------------------------------------------
import { blockActionPlugin } from "./block-action";
import { reviewActionPlugin } from "./review-action";
import { notifyActionPlugin } from "./notify-action";
import { allowActionPlugin } from "./allow-action";

// ---------------------------------------------------------------------------
// Registry class
// ---------------------------------------------------------------------------

export class BlockRegistry {
  private plugins = new Map<string, BlockPlugin<any>>();

  register<C>(plugin: BlockPlugin<C>): void {
    this.plugins.set(plugin.type, plugin);
  }

  get(type: string): BlockPlugin | undefined {
    return this.plugins.get(type);
  }

  getAll(): BlockPlugin[] {
    return Array.from(this.plugins.values());
  }

  getByCategory(category: "condition" | "group" | "action"): BlockPlugin[] {
    return this.getAll().filter((p) => p.category === category);
  }
}

// ---------------------------------------------------------------------------
// Default registry with all 12 built-in plugins
// ---------------------------------------------------------------------------

export const defaultRegistry = new BlockRegistry();

// Conditions (5)
defaultRegistry.register(severityConditionPlugin);
defaultRegistry.register(categoryConditionPlugin);
defaultRegistry.register(riskScoreConditionPlugin);
defaultRegistry.register(branchConditionPlugin);
defaultRegistry.register(licenseConditionPlugin);

// Groups (3)
defaultRegistry.register(andGroupPlugin);
defaultRegistry.register(orGroupPlugin);
defaultRegistry.register(notGroupPlugin);

// Actions (4)
defaultRegistry.register(blockActionPlugin);
defaultRegistry.register(reviewActionPlugin);
defaultRegistry.register(notifyActionPlugin);
defaultRegistry.register(allowActionPlugin);
