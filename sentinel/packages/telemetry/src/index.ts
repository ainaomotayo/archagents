export { createLogger, withCorrelationId, type Logger } from "./logger.js";
export {
  registry,
  httpRequestDuration,
  scanDuration,
  findingsTotal,
  agentResultsTotal,
  pendingScansGauge,
  dlqDepthGauge,
} from "./metrics.js";
