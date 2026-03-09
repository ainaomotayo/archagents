/**
 * Redis Streams tuning configuration for SENTINEL event bus.
 */

export interface StreamTuningConfig {
  stream: string;
  maxLen: number; // MAXLEN for stream trimming
  consumerGroupCount: number;
  blockTimeoutMs: number;
  batchSize: number;
}

export const STREAM_CONFIGS: StreamTuningConfig[] = [
  {
    stream: "sentinel.diffs",
    maxLen: 100_000,
    consumerGroupCount: 6,
    blockTimeoutMs: 5_000,
    batchSize: 10,
  },
  {
    stream: "sentinel.findings",
    maxLen: 500_000,
    consumerGroupCount: 1,
    blockTimeoutMs: 5_000,
    batchSize: 50,
  },
  {
    stream: "sentinel.escalations",
    maxLen: 50_000,
    consumerGroupCount: 1,
    blockTimeoutMs: 10_000,
    batchSize: 5,
  },
];

/**
 * Generates the Redis XTRIM command arguments for the given stream config.
 * Returns: ["XTRIM", stream, "MAXLEN", "~", maxLen]
 * The "~" enables approximate trimming for better performance.
 */
export function generateXtrimCommand(config: StreamTuningConfig): string[] {
  return [
    "XTRIM",
    config.stream,
    "MAXLEN",
    "~",
    String(config.maxLen),
  ];
}

/**
 * Generates XGROUP CREATE commands for each consumer in the given stream config.
 * Each consumer name is formatted as "${stream}.${consumerName}".
 * Returns an array of command argument arrays.
 */
export function generateXgroupCommands(
  config: StreamTuningConfig,
  consumers: string[],
): string[][] {
  return consumers.map((consumer) => [
    "XGROUP",
    "CREATE",
    config.stream,
    consumer,
    "0",
    "MKSTREAM",
  ]);
}

/**
 * Estimates the memory usage in MB for a stream given the max length
 * and average message size.
 *
 * Redis stream overhead per entry is approximately 100 bytes for metadata
 * (radix tree node, listpack entry headers, stream ID, etc.).
 */
export function estimateMemoryUsageMb(
  config: StreamTuningConfig,
  avgMessageSizeBytes: number,
): number {
  const OVERHEAD_PER_ENTRY_BYTES = 100;
  const totalBytesPerEntry = avgMessageSizeBytes + OVERHEAD_PER_ENTRY_BYTES;
  const totalBytes = config.maxLen * totalBytesPerEntry;
  return Math.ceil(totalBytes / (1024 * 1024));
}
