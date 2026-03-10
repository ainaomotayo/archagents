import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { Resource } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

let sdk: NodeSDK | undefined;

export interface TracingOptions {
  serviceName: string;
  serviceVersion?: string;
  /** OTLP endpoint, defaults to http://localhost:4318 */
  endpoint?: string;
}

/**
 * Initialize OpenTelemetry tracing with OTLP exporter.
 * Call once at service startup before any other imports.
 */
export function initTracing(opts: TracingOptions): void {
  if (sdk) return; // Already initialized

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: opts.serviceName,
    [ATTR_SERVICE_VERSION]: opts.serviceVersion ?? "0.1.0",
  });

  const traceExporter = new OTLPTraceExporter({
    url: opts.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318/v1/traces",
  });

  sdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  });

  sdk.start();
}

/**
 * Gracefully shut down the OpenTelemetry SDK.
 * Call during service shutdown to flush pending spans.
 */
export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = undefined;
  }
}
