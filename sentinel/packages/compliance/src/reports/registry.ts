import type { ReactElement } from "react";
import type { BrandingContext } from "./branding.js";

export interface GatherContext {
  orgId: string;
  db: any;
  parameters: Record<string, unknown>;
}

export interface ReportTemplate<TData = unknown> {
  type: string;
  displayName: string;
  description: string;
  gather(ctx: GatherContext): Promise<TData>;
  render(data: TData, branding: BrandingContext): ReactElement;
}

export class ReportRegistry {
  private templates = new Map<string, ReportTemplate>();

  register(template: ReportTemplate): void {
    if (this.templates.has(template.type)) {
      throw new Error(`Report template "${template.type}" already registered`);
    }
    this.templates.set(template.type, template);
  }

  get(type: string): ReportTemplate | undefined {
    return this.templates.get(type);
  }

  has(type: string): boolean {
    return this.templates.has(type);
  }

  list(): ReportTemplate[] {
    return Array.from(this.templates.values());
  }
}
