"use client";

import { useState, useMemo } from "react";
import type { Attestation, AttestationType, AttestationStatus } from "./attestation-types";
import { AttestationSummaryCards } from "./AttestationSummaryCards";
import { AttestationFilterBar } from "./AttestationFilterBar";
import { AttestationCard } from "./AttestationCard";

interface AttestationListClientProps {
  attestations: Attestation[];
}

export function AttestationListClient({ attestations }: AttestationListClientProps) {
  const [typeFilter, setTypeFilter] = useState<AttestationType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<AttestationStatus | "all">("all");
  const [frameworkFilter, setFrameworkFilter] = useState("all");
  const [search, setSearch] = useState("");

  const frameworks = useMemo(
    () => [...new Set(attestations.map((a) => a.frameworkSlug))].sort(),
    [attestations],
  );

  const filtered = useMemo(() => {
    let result = attestations;
    if (typeFilter !== "all") {
      result = result.filter((a) => a.type === typeFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter((a) => a.status === statusFilter);
    }
    if (frameworkFilter !== "all") {
      result = result.filter((a) => a.frameworkSlug === frameworkFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.controlCode.toLowerCase().includes(q) ||
          a.createdBy.toLowerCase().includes(q),
      );
    }
    return result;
  }, [attestations, typeFilter, statusFilter, frameworkFilter, search]);

  return (
    <div className="space-y-4">
      <AttestationSummaryCards attestations={attestations} />
      <AttestationFilterBar
        typeFilter={typeFilter}
        statusFilter={statusFilter}
        frameworkFilter={frameworkFilter}
        search={search}
        frameworks={frameworks}
        onTypeChange={setTypeFilter}
        onStatusChange={setStatusFilter}
        onFrameworkChange={setFrameworkFilter}
        onSearchChange={setSearch}
      />
      {filtered.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border bg-surface-1">
          <p className="text-[13px] text-text-tertiary">
            No attestations match the current filters.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((a, i) => (
            <AttestationCard key={a.id} attestation={a} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
