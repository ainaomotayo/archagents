import { renderToBuffer } from "@react-pdf/renderer";
import type { ReportRegistry, BrandingContext } from "@sentinel/compliance";

export interface RenderResult {
  buffer: Buffer;
  fileSize: number;
  pageCount: number;
}

export async function renderReport(
  registry: ReportRegistry,
  type: string,
  data: unknown,
  branding: BrandingContext,
  timeoutMs = 60_000,
): Promise<RenderResult> {
  const template = registry.get(type);
  if (!template) {
    throw new Error(`Unknown report type: ${type}`);
  }

  const element = template.render(data, branding);

  const buffer = await Promise.race([
    renderToBuffer(element as any) as Promise<Buffer>,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Render timeout exceeded")), timeoutMs),
    ),
  ]);

  // Count pages by looking for /Type /Page in the PDF (simple heuristic)
  const pdfStr = buffer.toString("latin1");
  const pageCount = Math.max(
    1,
    (pdfStr.match(/\/Type\s*\/Page[^s]/g) || []).length,
  );

  return {
    buffer,
    fileSize: buffer.length,
    pageCount,
  };
}
