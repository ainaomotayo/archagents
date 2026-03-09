/**
 * Type definitions for Prisma Client transaction support.
 * Uses the real Prisma generated types for full model access within transactions.
 */

import type { PrismaClient } from "@prisma/client";
import type { ITXClientDenyList } from "@prisma/client/runtime/library";

export type TransactionClient = Omit<PrismaClient, ITXClientDenyList>;

export type PrismaClientLike = PrismaClient;
