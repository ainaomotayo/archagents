"use client";

import { useState } from "react";
import {
  DOCUMENT_TYPE_LABELS,
  type WizardDocument,
  type WizardDocumentType,
} from "@/lib/wizard-types";

interface DocumentGenerationPanelProps {
  documents: WizardDocument[];
  blockingSteps: Record<string, string[]>;
  onGenerate: (docTypes: WizardDocumentType[]) => void;
}

type DocStatus = "blocked" | "ready_to_generate" | "generating" | "ready_download";

function getDocStatus(
  docType: WizardDocumentType,
  documents: WizardDocument[],
  blockingSteps: Record<string, string[]>,
): DocStatus {
  const blocking = blockingSteps[docType];
  if (blocking && blocking.length > 0) return "blocked";

  const doc = documents.find((d) => d.documentType === docType);
  if (!doc) return "ready_to_generate";
  if (doc.status === "generating") return "generating";
  if (doc.status === "ready") return "ready_download";
  return "ready_to_generate";
}

function StatusIndicator({
  status,
  blockingCodes,
}: {
  status: DocStatus;
  blockingCodes?: string[];
}) {
  switch (status) {
    case "blocked":
      return (
        <p className="text-[12px] text-amber-500">
          Blocked by: {blockingCodes?.join(", ")}
        </p>
      );
    case "ready_to_generate":
      return (
        <p className="text-[12px] text-emerald-500">Ready to generate</p>
      );
    case "generating":
      return (
        <p className="animate-pulse text-[12px] text-blue-400">
          Generating...
        </p>
      );
    case "ready_download":
      return (
        <p className="text-[12px] font-medium text-emerald-500">
          Ready - Download
        </p>
      );
    default:
      return null;
  }
}

export function DocumentGenerationPanel({
  documents,
  blockingSteps,
  onGenerate,
}: DocumentGenerationPanelProps) {
  const [selected, setSelected] = useState<Set<WizardDocumentType>>(new Set());

  const docTypes = Object.keys(DOCUMENT_TYPE_LABELS) as WizardDocumentType[];

  const toggleSelect = (dt: WizardDocumentType) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dt)) {
        next.delete(dt);
      } else {
        next.add(dt);
      }
      return next;
    });
  };

  const allGeneratable = docTypes.filter(
    (dt) => getDocStatus(dt, documents, blockingSteps) === "ready_to_generate",
  );

  const selectedGeneratable = Array.from(selected).filter((dt) =>
    allGeneratable.includes(dt),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-text-primary">
          Documents
        </h3>
        {allGeneratable.length > 0 && (
          <button
            type="button"
            onClick={() => onGenerate(allGeneratable)}
            className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:brightness-110"
          >
            Generate All
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {docTypes.map((dt) => {
          const status = getDocStatus(dt, documents, blockingSteps);
          const blocking = blockingSteps[dt];
          const doc = documents.find((d) => d.documentType === dt);
          const isGeneratable = status === "ready_to_generate";

          return (
            <div
              key={dt}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-4"
            >
              <div className="flex items-start justify-between">
                <h4 className="text-[13px] font-semibold text-text-primary">
                  {DOCUMENT_TYPE_LABELS[dt]}
                </h4>
                {status === "ready_download" && doc?.reportId && (
                  <a
                    href={`/api/reports/${doc.reportId}/download`}
                    download
                    className="text-[12px] font-medium text-accent hover:brightness-110"
                  >
                    Download
                  </a>
                )}
              </div>

              <StatusIndicator status={status} blockingCodes={blocking} />

              {isGeneratable && (
                <button
                  type="button"
                  onClick={() => onGenerate([dt])}
                  className="mt-1 self-start rounded-md border border-border bg-surface-2 px-3 py-1 text-[12px] font-medium text-text-secondary transition-colors hover:bg-surface-2/80 hover:text-text-primary"
                >
                  Generate
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
