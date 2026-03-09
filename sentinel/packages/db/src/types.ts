/**
 * Minimal type definitions for Prisma Client used before `prisma generate` runs.
 * Once the database is available and `prisma generate` executes, these can be
 * replaced with the real generated types from @prisma/client.
 */

export interface TransactionClient {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
}

export interface PrismaClientLike {
  $transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T>;
}
