import { PrismaClient } from "@prisma/client";
import type { EnvelopeEncryption } from "@sentinel/security";
import { createEncryptionMiddleware } from "./encryption-middleware.js";

let basePrisma: PrismaClient | undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prisma: any; // extended client may differ from base PrismaClient type
let currentOrgId: string | null = null;

function ensureBase(): PrismaClient {
  if (!basePrisma) {
    basePrisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["query"] : ["error"],
    });
    prisma = basePrisma;
  }
  return basePrisma;
}

export function getDb(): PrismaClient {
  ensureBase();
  return prisma as PrismaClient;
}

/**
 * Register the encryption middleware on the Prisma client via $extends.
 * Call once at server startup after the EnvelopeEncryption instance is ready.
 * Replaces the cached client with an extended version that intercepts all operations.
 */
export function initEncryption(envelope: EnvelopeEncryption): void {
  const db = ensureBase();
  const middleware = createEncryptionMiddleware(envelope, () => currentOrgId);

  prisma = db.$extends({
    query: {
      $allOperations({ model, operation, args, query }: {
        model?: string;
        operation: string;
        args: any;
        query: (args: any) => Promise<any>;
      }) {
        // Adapt $extends callback shape to the classic middleware (params, next) shape
        const params = { model, action: operation, args };
        return middleware(params, (p: any) => query(p.args));
      },
    },
  });
}

/**
 * Set the current org ID for request-scoped encryption context.
 * Call at the start of each request; set to null when the request ends.
 */
export function setCurrentOrgId(orgId: string | null): void {
  currentOrgId = orgId;
}

export async function disconnectDb(): Promise<void> {
  if (basePrisma) {
    await basePrisma.$disconnect();
    basePrisma = undefined;
    prisma = undefined;
    currentOrgId = null;
  }
}

export { PrismaClient };
