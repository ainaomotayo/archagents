export interface ScanEvent {
  type: "progress" | "finding" | "complete" | "error";
  data: unknown;
}

export interface StreamOptions {
  apiUrl: string;
  headers: Record<string, string>;
  signal?: AbortSignal;
  onEvent?: (event: ScanEvent) => void;
  fetchFn?: typeof globalThis.fetch;
}

/**
 * Attempts to stream scan results via SSE.
 * Returns the final result on success, or null if endpoint returns 404
 * (server doesn't support streaming — caller should fall back to poll).
 */
export async function streamScanResults<T>(
  scanId: string,
  opts: StreamOptions,
): Promise<T | null> {
  const fetchFn = opts.fetchFn ?? globalThis.fetch;

  const res = await fetchFn(`${opts.apiUrl}/v1/scans/${scanId}/stream`, {
    headers: { ...opts.headers, Accept: "text/event-stream" },
    signal: opts.signal,
  });

  if (res.status === 404) return null;

  if (!res.ok) {
    throw new Error(`Stream error: ${res.status} ${res.statusText}`);
  }

  if (!res.body) {
    throw new Error("Stream response has no body");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: T | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    let eventType = "message";
    let dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        dataLines.push(line.slice(6));
      } else if (line === "") {
        if (dataLines.length > 0) {
          const raw = dataLines.join("\n");
          try {
            const data = JSON.parse(raw);
            const event: ScanEvent = { type: eventType as ScanEvent["type"], data };
            opts.onEvent?.(event);
            if (eventType === "complete") {
              finalResult = data as T;
            }
          } catch {
            // Non-JSON data — skip
          }
        }
        eventType = "message";
        dataLines = [];
      }
    }
  }

  if (!finalResult) {
    throw new Error("Stream ended without a 'complete' event");
  }

  return finalResult;
}
