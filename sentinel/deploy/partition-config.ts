/**
 * Postgres partition management configuration for SENTINEL tables.
 */

export interface PartitionConfig {
  table: string;
  partitionBy: "RANGE" | "LIST";
  partitionKey: string;
  interval: "daily" | "weekly" | "monthly";
  retentionPeriod: number; // days
  premakeCount: number; // partitions to create ahead of time
}

export const PARTITION_CONFIGS: PartitionConfig[] = [
  {
    table: "scans",
    partitionBy: "RANGE",
    partitionKey: "created_at",
    interval: "monthly",
    retentionPeriod: 365,
    premakeCount: 3,
  },
  {
    table: "findings",
    partitionBy: "RANGE",
    partitionKey: "created_at",
    interval: "monthly",
    retentionPeriod: 365,
    premakeCount: 3,
  },
  {
    table: "audit_events",
    partitionBy: "RANGE",
    partitionKey: "timestamp",
    interval: "monthly",
    retentionPeriod: 2555, // ~7 years for compliance
    premakeCount: 6,
  },
];

/**
 * Returns the partition boundary start date for the given date and interval.
 */
function getIntervalStart(date: Date, interval: PartitionConfig["interval"]): Date {
  const d = new Date(date);
  if (interval === "daily") {
    d.setUTCHours(0, 0, 0, 0);
  } else if (interval === "weekly") {
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - day);
    d.setUTCHours(0, 0, 0, 0);
  } else {
    // monthly
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
  }
  return d;
}

/**
 * Returns the next interval boundary from the given start.
 */
function nextInterval(date: Date, interval: PartitionConfig["interval"]): Date {
  const d = new Date(date);
  if (interval === "daily") {
    d.setUTCDate(d.getUTCDate() + 1);
  } else if (interval === "weekly") {
    d.setUTCDate(d.getUTCDate() + 7);
  } else {
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return d;
}

/**
 * Subtracts one interval from the given date.
 */
function prevInterval(date: Date, interval: PartitionConfig["interval"]): Date {
  const d = new Date(date);
  if (interval === "daily") {
    d.setUTCDate(d.getUTCDate() - 1);
  } else if (interval === "weekly") {
    d.setUTCDate(d.getUTCDate() - 7);
  } else {
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return d;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "_");
}

function formatSqlDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function partitionName(table: string, date: Date): string {
  return `${table}_${formatDate(date)}`;
}

/**
 * Generates the SQL to create a partition for a given config and date.
 */
export function generateCreatePartitionSql(
  config: PartitionConfig,
  date: Date,
): string {
  const start = getIntervalStart(date, config.interval);
  const end = nextInterval(start, config.interval);
  const name = partitionName(config.table, start);

  return `CREATE TABLE IF NOT EXISTS ${name} PARTITION OF ${config.table} FOR VALUES FROM ('${formatSqlDate(start)}') TO ('${formatSqlDate(end)}');`;
}

/**
 * Generates the SQL to drop a partition for a given config and date.
 */
export function generateDropPartitionSql(
  config: PartitionConfig,
  date: Date,
): string {
  const start = getIntervalStart(date, config.interval);
  const name = partitionName(config.table, start);
  return `DROP TABLE IF EXISTS ${name};`;
}

/**
 * Returns a list of SQL statements for partitions that should be created ahead
 * of the current date, based on the premakeCount.
 */
export function getPartitionsToCreate(
  config: PartitionConfig,
  currentDate: Date,
): string[] {
  const statements: string[] = [];
  let start = getIntervalStart(currentDate, config.interval);

  for (let i = 0; i <= config.premakeCount; i++) {
    statements.push(generateCreatePartitionSql(config, start));
    start = nextInterval(start, config.interval);
  }

  return statements;
}

/**
 * Returns a list of SQL statements for partitions that have exceeded
 * the retention period and should be dropped.
 */
export function getPartitionsToDrop(
  config: PartitionConfig,
  currentDate: Date,
): string[] {
  const statements: string[] = [];
  const cutoff = new Date(currentDate);
  cutoff.setUTCDate(cutoff.getUTCDate() - config.retentionPeriod);

  // Check a generous window of past intervals for partitions to drop.
  // We look back 12 additional intervals beyond the cutoff.
  let checkDate = getIntervalStart(cutoff, config.interval);
  for (let i = 0; i < 12; i++) {
    checkDate = prevInterval(checkDate, config.interval);
    statements.push(generateDropPartitionSql(config, checkDate));
  }

  return statements;
}
