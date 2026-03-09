import { createHash, randomUUID } from "node:crypto";

export interface AuditActor {
  type: "system" | "user" | "agent" | "api";
  id: string;
  name: string;
  ip?: string;
}

export interface AuditInput {
  actor: AuditActor;
  action: string;
  resource: { type: string; id: string };
  detail: Record<string, unknown>;
}

/** Minimal DB interface so we don't depend on Prisma client. */
export interface AuditEventStore {
  findFirst(args: {
    where: { orgId: string };
    orderBy: { timestamp: "desc" };
    select: { eventHash: true };
  }): Promise<{ eventHash: string } | null>;
  create(args: {
    data: Record<string, unknown>;
  }): Promise<Record<string, unknown>>;
}

export class AuditLog {
  constructor(private store: AuditEventStore) {}

  async append(orgId: string, input: AuditInput) {
    // 1. Get the previous event's hash (or "GENESIS" if first event)
    const previousEvent = await this.store.findFirst({
      where: { orgId },
      orderBy: { timestamp: "desc" },
      select: { eventHash: true },
    });
    const previousEventHash = previousEvent?.eventHash ?? "GENESIS";

    // 2. Generate event metadata
    const id = randomUUID();
    const timestamp = new Date();

    // 3. Compute deterministic hash of event contents
    const hashInput = JSON.stringify({
      id,
      timestamp: timestamp.toISOString(),
      orgId,
      ...input,
      previousEventHash,
    });
    const eventHash = `sha256:${createHash("sha256").update(hashInput).digest("hex")}`;

    // 4. Persist
    const event = await this.store.create({
      data: {
        id,
        orgId,
        timestamp,
        actorType: input.actor.type,
        actorId: input.actor.id,
        actorName: input.actor.name,
        actorIp: input.actor.ip ?? null,
        action: input.action,
        resourceType: input.resource.type,
        resourceId: input.resource.id,
        detail: input.detail,
        previousEventHash,
        eventHash,
      },
    });

    return event;
  }
}
