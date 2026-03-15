// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import type { EvidenceAttachment } from "@/lib/types";

vi.mock("@/app/(dashboard)/remediations/actions", () => ({
  uploadEvidenceAction: vi.fn(),
  confirmEvidenceAction: vi.fn(),
  deleteEvidenceAction: vi.fn(),
}));

import { EvidenceUpload } from "@/components/remediations/evidence-upload";

function makeEvidence(overrides: Partial<EvidenceAttachment> = {}): EvidenceAttachment {
  return {
    id: "ev-1",
    remediationId: "rem-1",
    fileName: "report.pdf",
    fileSize: 204800,
    mimeType: "application/pdf",
    s3Key: "orgs/org-1/evidence/report.pdf",
    uploadedBy: "alice",
    createdAt: "2026-03-10T12:00:00Z",
    ...overrides,
  };
}

const defaultProps = {
  remediationId: "rem-1",
  onDownload: vi.fn().mockResolvedValue("https://example.com/download"),
};

describe("EvidenceUpload", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders drop zone with correct instructions text", () => {
    render(
      <EvidenceUpload {...defaultProps} initialEvidence={[]} />,
    );
    expect(screen.getByText("Drag and drop a file, or click to browse")).toBeDefined();
    expect(
      screen.getByText("Max 25 MB. Allowed: PDF, PNG, JPG, GIF, DOC, DOCX, CSV, TXT, JSON, XML, YAML"),
    ).toBeDefined();
  });

  it("shows existing evidence files from initialEvidence", () => {
    const evidence = [
      makeEvidence({ id: "ev-1", fileName: "report.pdf" }),
      makeEvidence({ id: "ev-2", fileName: "screenshot.png" }),
    ];
    render(
      <EvidenceUpload {...defaultProps} initialEvidence={evidence} />,
    );
    expect(screen.getByText("report.pdf")).toBeDefined();
    expect(screen.getByText("screenshot.png")).toBeDefined();
  });

  it("shows file size and upload date for evidence entries", () => {
    const evidence = [
      makeEvidence({
        id: "ev-1",
        fileName: "report.pdf",
        fileSize: 204800,
        uploadedBy: "alice",
        createdAt: "2026-03-10T12:00:00Z",
      }),
    ];
    render(
      <EvidenceUpload {...defaultProps} initialEvidence={evidence} />,
    );
    // formatFileSize(204800) = "200.0 KB"
    // formatDate("2026-03-10T12:00:00Z") = "Mar 10, 2026"
    // The component renders: "{size} · {uploadedBy} · {date}"
    expect(screen.getByText(/200\.0 KB/)).toBeDefined();
    expect(screen.getByText(/Mar 10, 2026/)).toBeDefined();
  });

  it("shows 'No evidence files uploaded yet' when empty", () => {
    render(
      <EvidenceUpload {...defaultProps} initialEvidence={[]} />,
    );
    expect(screen.getByText("No evidence files uploaded yet.")).toBeDefined();
  });

  it("shows download and delete buttons for each evidence entry", () => {
    const evidence = [
      makeEvidence({ id: "ev-1", fileName: "report.pdf" }),
      makeEvidence({ id: "ev-2", fileName: "screenshot.png" }),
    ];
    render(
      <EvidenceUpload {...defaultProps} initialEvidence={evidence} />,
    );
    const downloadButtons = screen.getAllByText("Download");
    const deleteButtons = screen.getAllByText("Delete");
    expect(downloadButtons).toHaveLength(2);
    expect(deleteButtons).toHaveLength(2);
  });

  it("validates file type — rejects disallowed extensions", async () => {
    const { uploadEvidenceAction } = await import(
      "@/app/(dashboard)/remediations/actions"
    );
    render(
      <EvidenceUpload {...defaultProps} initialEvidence={[]} />,
    );
    // The component uses internal validateFile which checks extension.
    // We simulate by getting the hidden file input and triggering change with a bad file.
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeDefined();

    const badFile = new File(["malware"], "hack.exe", { type: "application/x-msdownload" });
    Object.defineProperty(badFile, "size", { value: 1024 });

    // Fire change event
    Object.defineProperty(fileInput, "files", { value: [badFile], writable: false });
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));

    // The uploadEvidenceAction should NOT have been called since validation fails
    expect(uploadEvidenceAction).not.toHaveBeenCalled();
  });
});
