"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface RemediationStreamEvent {
  type: string;
  itemId: string;
}

export interface RemediationStreamState {
  connected: boolean;
  error: string | null;
}

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const POLL_INTERVAL_MS = 30_000;

export function useRemediationStream(
  onEvent: (data: RemediationStreamEvent) => void,
): RemediationStreamState {
  const [state, setState] = useState<RemediationStreamState>({
    connected: false,
    error: null,
  });

  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEventId = useRef("");
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const cleanup = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
  }, []);

  useEffect(() => {
    const baseUrl = "/api/remediations/stream";

    // -- SSE path --
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

        es.onmessage = (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data) as RemediationStreamEvent;
            const id = e.lastEventId ?? "";
            if (id) lastEventId.current = id;
            onEventRef.current(data);
          } catch {
            // Ignore malformed events
          }
        };

        es.onerror = () => {
          setState((prev) => ({ ...prev, connected: false }));
          es?.close();

          const delay = Math.min(
            RECONNECT_BASE_MS * 2 ** reconnectAttempts.current + Math.random() * 500,
            RECONNECT_MAX_MS,
          );
          reconnectAttempts.current += 1;
          reconnectTimer.current = setTimeout(connect, delay);
          setState((prev) => ({ ...prev, error: "Connection lost. Reconnecting..." }));
        };
      };

      connect();

      return () => {
        es?.close();
        cleanup();
      };
    }

    // -- Polling fallback --
    let active = true;

    const poll = async () => {
      try {
        const res = await fetch("/api/remediations/stream?poll=true");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (Array.isArray(json.events)) {
          for (const event of json.events) {
            onEventRef.current(event);
          }
        }
        setState((prev) => ({ ...prev, connected: true, error: null }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          connected: false,
          error: err instanceof Error ? err.message : "Polling failed",
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
  }, [cleanup]);

  return state;
}
