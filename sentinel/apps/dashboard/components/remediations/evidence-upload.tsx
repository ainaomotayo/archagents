"use client";

import { useState, useRef, useCallback } from "react";
import type { EvidenceAttachment } from "@/lib/types";
import {
  uploadEvidenceAction,
  confirmEvidenceAction,
  deleteEvidenceAction,
} from "@/app/(dashboard)/remediations/actions";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const ALLOWED_EXTENSIONS = new Set([
  "pdf", "png", "jpg", "jpeg", "gif",
  "doc", "docx", "csv", "txt",
  "json", "xml", "yaml", "yml",
]);
const ALLOWED_MIME_PREFIX = new Set([
  "application/pdf",
  "image/png", "image/jpeg", "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv", "text/plain",
  "application/json", "application/xml", "text/xml",
  "application/x-yaml", "text/yaml",
]);

function getExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function isAllowedFile(file: File): boolean {
  return ALLOWED_EXTENSIONS.has(getExtension(file.name));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface EvidenceUploadProps {
  remediationId: string;
  initialEvidence: EvidenceAttachment[];
  onDownload: (evidenceId: string) => Promise<string | null>;
}

export function EvidenceUpload({
  remediationId,
  initialEvidence,
  onDownload,
}: EvidenceUploadProps) {
  const [evidence, setEvidence] = useState<EvidenceAttachment[]>(initialEvidence);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return `File "${file.name}" exceeds the 25 MB limit (${formatFileSize(file.size)}).`;
    }
    if (!isAllowedFile(file)) {
      return `File type ".${getExtension(file.name)}" is not allowed. Accepted: ${Array.from(ALLOWED_EXTENSIONS).join(", ")}.`;
    }
    return null;
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setUploading(true);
    setUploadProgress(0);

    try {
      // Step 1: Get presigned URL
      setUploadProgress(10);
      const { uploadUrl, s3Key } = await uploadEvidenceAction(
        remediationId,
        file.name,
        file.size,
        file.type || "application/octet-stream",
      );

      // Step 2: Upload to presigned URL
      setUploadProgress(30);
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!uploadRes.ok) {
        throw new Error("Failed to upload file to storage.");
      }
      setUploadProgress(70);

      // Step 3: Confirm upload
      const confirmed = await confirmEvidenceAction(
        remediationId,
        s3Key,
        file.name,
        file.size,
        file.type || "application/octet-stream",
      );
      setUploadProgress(100);

      // Add to local state
      if (confirmed?.id) {
        setEvidence((prev) => [...prev, confirmed as EvidenceAttachment]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [remediationId, validateFile]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) uploadFile(files[0]);
    },
    [uploadFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) uploadFile(files[0]);
      // Reset so same file can be re-selected
      e.target.value = "";
    },
    [uploadFile],
  );

  const handleDelete = useCallback(
    async (evidenceId: string) => {
      setDeletingId(evidenceId);
      setError(null);
      try {
        await deleteEvidenceAction(remediationId, evidenceId);
        setEvidence((prev) => prev.filter((e) => e.id !== evidenceId));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete evidence.");
      } finally {
        setDeletingId(null);
      }
    },
    [remediationId],
  );

  const handleDownload = useCallback(
    async (evidenceId: string) => {
      setError(null);
      try {
        const url = await onDownload(evidenceId);
        if (url) {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to get download URL.");
      }
    },
    [onDownload],
  );

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-text-primary">Evidence Attachments</h2>
      <div className="rounded-xl border border-border bg-surface-1 p-5 space-y-4">
        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors ${
            isDragging
              ? "border-accent bg-accent/5"
              : "border-border hover:border-accent/50 hover:bg-surface-2/50"
          }`}
        >
          <svg
            className="h-8 w-8 text-text-tertiary"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
            />
          </svg>
          <p className="text-[12px] font-medium text-text-secondary">
            {isDragging ? "Drop file here" : "Drag and drop a file, or click to browse"}
          </p>
          <p className="text-[10px] text-text-tertiary">
            Max 25 MB. Allowed: PDF, PNG, JPG, GIF, DOC, DOCX, CSV, TXT, JSON, XML, YAML
          </p>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={Array.from(ALLOWED_EXTENSIONS).map((ext) => `.${ext}`).join(",")}
            onChange={handleFileSelect}
          />
        </div>

        {/* Upload progress */}
        {uploading && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-text-secondary">Uploading...</span>
              <span className="text-[11px] font-mono text-text-tertiary">{uploadProgress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-[12px] text-status-fail">{error}</p>
        )}

        {/* Existing evidence */}
        {evidence.length > 0 && (
          <div className="space-y-2">
            {evidence.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-3 rounded-lg border border-border/50 bg-surface-0/50 px-4 py-3"
              >
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-surface-2">
                  <svg
                    className="h-4 w-4 text-text-tertiary"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                    />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-text-primary">
                    {att.fileName}
                  </p>
                  <p className="text-[10px] text-text-tertiary">
                    {formatFileSize(att.fileSize)} &middot; {att.uploadedBy} &middot; {formatDate(att.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDownload(att.id)}
                    className="rounded px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent-subtle transition-colors"
                  >
                    Download
                  </button>
                  <button
                    onClick={() => handleDelete(att.id)}
                    disabled={deletingId === att.id}
                    className="rounded px-2 py-1 text-[11px] font-medium text-status-fail/70 hover:text-status-fail hover:bg-status-fail/10 transition-colors disabled:opacity-40"
                  >
                    {deletingId === att.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {evidence.length === 0 && !uploading && (
          <p className="text-center text-[11px] text-text-tertiary">No evidence files uploaded yet.</p>
        )}
      </div>
    </div>
  );
}
