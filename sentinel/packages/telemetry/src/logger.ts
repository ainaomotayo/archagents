import pino from "pino";

export type Logger = pino.Logger;

export function createLogger(opts?: {
  name?: string;
  level?: string;
}): Logger {
  return pino({
    name: opts?.name ?? "sentinel",
    level: opts?.level ?? process.env.LOG_LEVEL ?? "info",
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers['x-sentinel-signature']",
        "req.headers['x-sentinel-api-key']",
        "body.secret",
        "body.password",
      ],
      censor: "[REDACTED]",
    },
  });
}

export function withCorrelationId(
  logger: Logger,
  correlationId: string,
): Logger {
  return logger.child({ correlationId });
}
