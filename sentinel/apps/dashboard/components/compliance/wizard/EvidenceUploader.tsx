"use client";

import { useCallback, useRef, useState } from "react";
import type { WizardEvidence } from "@/lib/wizard-types";

interface EvidenceUploaderProps {
  evidence: WizardEvidence[];
  disabled: boolean;
  onUpload: (file: File) => void;
  onDelete: (evidenceId: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncateHash(hash: string, len = 12): string {
  if (hash.length <= len) return hash;
  return `${hash.slice(0, len)}...`;
}

export function EvidenceUploader({
  evidence,
  disabled,
  onUpload,
  onDelete,
}: EvidenceUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || disabled) return;
      for (let i = 0; i < files.length; i++) {
        onUpload(files[i]);
      }
    },
    [disabled, onUpload],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) setIsDragging(true);
    },
    [disabled],
  );

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {/* Drop zone */}
      <button
        type="button"
        onClick={() => !disabled && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        disabled={disabled}
        className={[
          "flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-6 transition-colors",
          disabled
            ? "cursor-not-allowed border-border bg-surface-1 opacity-50"
            : isDragging
              ? "border-accent bg-surface-2"
              : "cursor-pointer border-border bg-surface-1 hover:border-text-secondary hover:bg-surface-2",
        ].join(" ")}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-text-tertiary"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span className="text-[13px] text-text-secondary">
          Drop files here or click to upload
        </span>
        <span className="text-[11px] text-text-tertiary">Max 50 MB</span>
      </button>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        disabled={disabled}
      />

      {/* File list */}
      {evidence.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {evidence.map((ev) => (
            <li
              key={ev.id}
              className="flex items-center justify-between rounded-md border border-border bg-surface-1 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-text-primary">
                  {ev.fileName}
                </p>
                <div className="flex items-center gap-3 text-[11px] text-text-tertiary">
                  <span>{formatFileSize(ev.fileSize)}</span>
                  {ev.sha256 && (
                    <span
                      className="font-mono"
                      title={ev.sha256}
                    >
                      SHA-256: {truncateHash(ev.sha256)}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onDelete(ev.id)}
                disabled={disabled}
                className={[
                  "ml-3 flex-shrink-0 rounded p-1 text-text-tertiary transition-colors",
                  disabled
                    ? "cursor-not-allowed opacity-50"
                    : "hover:bg-surface-2 hover:text-red-500",
                ].join(" ")}
                aria-label={`Delete ${ev.fileName}`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
