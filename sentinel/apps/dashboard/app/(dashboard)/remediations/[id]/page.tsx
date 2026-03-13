import Link from "next/link";
import { getRemediationById } from "@/lib/api";
import { IconChevronLeft } from "@/components/icons";
import { RemediationDetailClient } from "./detail-client";

interface RemediationDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function RemediationDetailPage({ params }: RemediationDetailPageProps) {
  const { id } = await params;
  const item = await getRemediationById(id);

  if (!item) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface-1">
          <svg
            className="h-7 w-7 text-text-tertiary"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-text-primary">Item not found</p>
          <p className="mt-1 text-[13px] text-text-tertiary">
            The requested remediation item could not be located.
          </p>
        </div>
        <Link
          href="/remediations"
          className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border bg-surface-1 px-4 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary focus-ring"
        >
          <IconChevronLeft className="h-3.5 w-3.5" />
          Back to Remediations
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <Link
          href="/remediations"
          className="inline-flex items-center gap-1 text-[13px] text-text-tertiary hover:text-accent transition-colors focus-ring rounded"
        >
          <IconChevronLeft className="h-3.5 w-3.5" />
          Remediations
        </Link>
        <h1 className="mt-3 text-xl font-bold tracking-tight text-text-primary">
          {item.title}
        </h1>
        <p className="mt-1 text-[13px] text-text-secondary">
          {item.itemType}
          {item.frameworkSlug ? ` / ${item.frameworkSlug.toUpperCase()}` : ""}
          {item.controlCode ? ` / ${item.controlCode}` : ""}
        </p>
      </div>
      <div className="animate-fade-up max-w-2xl" style={{ animationDelay: "0.05s" }}>
        <RemediationDetailClient item={item} />
      </div>
    </div>
  );
}
