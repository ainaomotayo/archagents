import type { PrismaClientLike, TransactionClient } from "./types.js";

export type { PrismaClientLike, TransactionClient };

export async function withTenant<T>(
  db: PrismaClientLike,
  orgId: string,
  fn: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_org_id', $1, true)`,
      orgId,
    );
    return fn(tx);
  });
}
