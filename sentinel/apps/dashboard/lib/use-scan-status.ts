"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScanStatusEvent = {
  scanId: string;
  status: "pending" | "scanning" | "completed" | "failed";
  progress?: number; // 0-100
  agentsCompleted?: number;
  agentsTotal?: number;
  updatedAt: string;
};

export interface UseScanStatusResult {
  status: ScanStatusEvent | null;
  connected: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Helpers (exported for testability)
// ---------------------------------------------------------------------------

const VALID_STATUSES = new Set(["pending", "scanning", "completed", "failed"]);

/**
 * Parse raw SSE `data` JSON into a validated ScanStatusEvent, or return null
 * if the payload is malformed / missing required fields.
 */
export function parseScanStatusEvent(data: string): ScanStatusEvent | null {
  try {
    const parsed = JSON.parse(data);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.scanId !== "string" ||
      !VALID_STATUSES.has(parsed.status) ||
      typeof parsed.updatedAt !== "string"
    ) {
      return null;
    }

    const event: ScanStatusEvent = {
      scanId: parsed.scanId,
      status: parsed.status,
      updatedAt: parsed.updatedAt,
    };

    if (typeof parsed.progress === "number") {
      event.progress = Math.max(0, Math.min(100, parsed.progress));
    }
    if (typeof parsed.agentsCompleted === "number") {
      event.agentsCompleted = parsed.agentsCompleted;
    }
    if (typeof parsed.agentsTotal === "number") {
      event.agentsTotal = parsed.agentsTotal;
    }

    return event;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const POLL_INTERVAL_MS = 5_000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * React hook that subscribes to real-time scan status updates via
 * Server-Sent Events (SSE).  Falls back to polling when EventSource is
 * unavailable (e.g. during SSR / testing).
 */
export function useScanStatus(scanId: string | null): UseScanStatusResult {
  const [status, setStatus] = useState<ScanStatusEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!scanId) {
      setStatus(null);
      setConnected(false);
      setError(null);
      return;
    }

    const url = `/api/scans/${encodeURIComponent(scanId)}/stream`;

    // ----- SSE path -----
    if (typeof EventSource !== "undefined") {
      let es: EventSource | null = null;

      const connect = () => {
        es = new EventSource(url);

        es.onopen = () => {
          setConnected(true);
          setError(null);
          reconnectAttempts.current = 0;
        };

        es.onmessage = (event: MessageEvent) => {
          const parsed = parseScanStatusEvent(event.data);
          if (parsed) {
            setStatus(parsed);
          }
        };

        es.onerror = () => {
          setConnected(false);
          es?.close();

          // Exponential back-off with jitter
          const delay = Math.min(
            RECONNECT_BASE_MS * 2 ** reconnectAttempts.current +
              Math.random() * 500,
            RECONNECT_MAX_MS,
          );
          reconnectAttempts.current += 1;
          setError("Connection lost. Reconnecting...");
          reconnectTimer.current = setTimeout(connect, delay);
        };
      };

      connect();

      return () => {
        es?.close();
        cleanup();
      };
    }

    // ----- Polling fallback -----
    let active = true;

    const poll = async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        // SSE stream may return multiple `data:` lines; grab the last one
        const lines = text
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim());
        const last = lines[lines.length - 1];
        if (last) {
          const parsed = parseScanStatusEvent(last);
          if (parsed) setStatus(parsed);
        }
        setConnected(true);
        setError(null);
      } catch (e) {
        setConnected(false);
        setError(e instanceof Error ? e.message : "Polling failed");
      }
    };

    poll();
    const id = setInterval(() => {
      if (active) poll();
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(id);
      cleanup();
    };
  }, [scanId, cleanup]);

  return { status, connected, error };
}
