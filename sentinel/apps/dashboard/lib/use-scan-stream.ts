"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// Event types — mirrors agent_core.streaming.types.EventType
// ---------------------------------------------------------------------------

export type ScanStreamEventType =
  | "finding.new"
  | "finding.enriched"
  | "finding.escalated"
  | "agent.started"
  | "agent.completed"
  | "scan.progress"
  | "scan.completed"
  | "scan.cancelled";

export interface FindingNewPayload {
  title: string;
  severity: string;
  file: string;
  scanner: string;
  [key: string]: unknown;
}

export interface AgentPayload {
  agent: string;
  [key: string]: unknown;
}

export interface ScanProgressPayload {
  scanId: string;
  progress: number;
  agentsCompleted: number;
  agentsTotal: number;
  [key: string]: unknown;
}

export interface ScanCompletedPayload {
  scanId: string;
  totalFindings: number;
  [key: string]: unknown;
}

export type StreamEventPayload =
  | FindingNewPayload
  | AgentPayload
  | ScanProgressPayload
  | ScanCompletedPayload
  | Record<string, unknown>;

export interface ScanStreamEvent {
  type: ScanStreamEventType;
  data: StreamEventPayload;
  id: string;
}

// ---------------------------------------------------------------------------
// Hook state
// ---------------------------------------------------------------------------

export interface ScanStreamState {
  /** All events received so far. */
  events: ScanStreamEvent[];
  /** Latest finding count. */
  findingCount: number;
  /** Agents that have started. */
  activeAgents: string[];
  /** Agents that have completed. */
  completedAgents: string[];
  /** Current progress (0-100). */
  progress: number;
  /** Whether the scan has completed. */
  isComplete: boolean;
  /** Whether we're connected to the SSE stream. */
  connected: boolean;
  /** Last error, if any. */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Helpers (exported for testability)
// ---------------------------------------------------------------------------

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const POLL_INTERVAL_MS = 5_000;

/**
 * Parse an SSE `data:` line into a ScanStreamEvent, or return null.
 */
export function parseStreamEvent(
  eventType: string,
  data: string,
  id: string,
): ScanStreamEvent | null {
  try {
    const parsed = JSON.parse(data);
    if (typeof parsed !== "object" || parsed === null) return null;

    return {
      type: eventType as ScanStreamEventType,
      data: parsed,
      id,
    };
  } catch {
    return null;
  }
}

/**
 * Reduce a new event into the current state.
 */
export function reduceEvent(
  state: ScanStreamState,
  event: ScanStreamEvent,
): ScanStreamState {
  const next = { ...state };
  next.events = [...state.events, event];

  switch (event.type) {
    case "finding.new":
    case "finding.enriched":
    case "finding.escalated":
      next.findingCount = state.findingCount + 1;
      break;

    case "agent.started": {
      const agent = (event.data as AgentPayload).agent;
      if (agent && !state.activeAgents.includes(agent)) {
        next.activeAgents = [...state.activeAgents, agent];
      }
      break;
    }

    case "agent.completed": {
      const agent = (event.data as AgentPayload).agent;
      if (agent && !state.completedAgents.includes(agent)) {
        next.completedAgents = [...state.completedAgents, agent];
      }
      break;
    }

    case "scan.progress": {
      const payload = event.data as ScanProgressPayload;
      if (typeof payload.progress === "number") {
        next.progress = Math.max(0, Math.min(100, payload.progress));
      }
      break;
    }

    case "scan.completed":
      next.isComplete = true;
      next.progress = 100;
      break;

    case "scan.cancelled":
      next.isComplete = true;
      break;
  }

  return next;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const INITIAL_STATE: ScanStreamState = {
  events: [],
  findingCount: 0,
  activeAgents: [],
  completedAgents: [],
  progress: 0,
  isComplete: false,
  connected: false,
  error: null,
};

/**
 * React hook that subscribes to real-time scan events via SSE.
 *
 * Features:
 * - Typed event handlers for all event types
 * - Auto-reconnect with Last-Event-ID for seamless resume
 * - Fallback to polling when EventSource is unavailable
 * - Connection state management
 */
export function useScanStream(scanId: string | null): ScanStreamState {
  const [state, setState] = useState<ScanStreamState>(INITIAL_STATE);

  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEventId = useRef<string>("");

  const cleanup = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!scanId) {
      setState(INITIAL_STATE);
      return;
    }

    const baseUrl = `/api/scans/${encodeURIComponent(scanId)}/stream`;

    // ----- SSE path -----
    if (typeof EventSource !== "undefined") {
      let es: EventSource | null = null;

      const connect = () => {
        const url = lastEventId.current
          ? `${baseUrl}?lastEventId=${encodeURIComponent(lastEventId.current)}`
          : baseUrl;

        es = new EventSource(url);

        es.onopen = () => {
          setState((prev) => ({ ...prev, connected: true, error: null }));
          reconnectAttempts.current = 0;
        };

        // Listen for named events (event: agent.started, etc.)
        const eventTypes: ScanStreamEventType[] = [
          "finding.new",
          "finding.enriched",
          "finding.escalated",
          "agent.started",
          "agent.completed",
          "scan.progress",
          "scan.completed",
          "scan.cancelled",
        ];

        for (const eventType of eventTypes) {
          es.addEventListener(eventType, (e: MessageEvent) => {
            const event = parseStreamEvent(eventType, e.data, e.lastEventId ?? "");
            if (event) {
              lastEventId.current = event.id || lastEventId.current;
              setState((prev) => reduceEvent(prev, event));
            }
          });
        }

        // Fallback: generic message handler for events without `event:` field
        es.onmessage = (e: MessageEvent) => {
          const event = parseStreamEvent("scan.progress", e.data, e.lastEventId ?? "");
          if (event) {
            lastEventId.current = event.id || lastEventId.current;
            setState((prev) => reduceEvent(prev, event));
          }
        };

        es.onerror = () => {
          setState((prev) => ({ ...prev, connected: false }));
          es?.close();

          // Don't reconnect if scan is complete
          setState((prev) => {
            if (prev.isComplete) return prev;

            const delay = Math.min(
              RECONNECT_BASE_MS * 2 ** reconnectAttempts.current +
                Math.random() * 500,
              RECONNECT_MAX_MS,
            );
            reconnectAttempts.current += 1;
            reconnectTimer.current = setTimeout(connect, delay);

            return { ...prev, error: "Connection lost. Reconnecting..." };
          });
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
        const url = `${baseUrl}?poll=true`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        if (json && typeof json === "object") {
          setState((prev) => ({
            ...prev,
            connected: true,
            error: null,
            progress: json.progress ?? prev.progress,
            isComplete: json.status === "completed" || json.status === "cancelled",
          }));
        }
      } catch (e) {
        setState((prev) => ({
          ...prev,
          connected: false,
          error: e instanceof Error ? e.message : "Polling failed",
        }));
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

  return state;
}
