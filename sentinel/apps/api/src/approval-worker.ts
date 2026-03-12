// ---------------------------------------------------------------------------
// Approval Worker — Escalation Sweep, Expiry Processing, Certificate Issuance
// ---------------------------------------------------------------------------
//
// This module exports pure functions for escalation and expiration processing
// so they can be tested in isolation. The main entry point (Redis consumer,
// health server, sweep timer) only runs when executed directly.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Escalation & Expiration Logic (exported for testing)
// ---------------------------------------------------------------------------

export async function processEscalations(dbClient: any, bus: any): Promise<number> {
  const gates = await dbClient.approvalGate.findMany({
    where: {
      status: { in: ["pending"] },
      escalatesAt: { lte: new Date() },
    },
  });

  for (const gate of gates) {
    await dbClient.approvalGate.update({
      where: { id: gate.id },
      data: {
        status: "escalated",
        assignedRole: "admin",
        priority: 90,
      },
    });

    await bus.publish("sentinel.notifications", {
      id: `evt-${gate.id}-escalated`,
      orgId: gate.orgId,
      topic: "approval.escalated",
      payload: {
        gateId: gate.id,
        scanId: gate.scanId,
        previousRole: gate.assignedRole,
        escalatedTo: "admin",
      },
      timestamp: new Date().toISOString(),
    });
  }

  return gates.length;
}

export async function processExpirations(dbClient: any, bus: any): Promise<number> {
  const gates = await dbClient.approvalGate.findMany({
    where: {
      status: { in: ["pending", "escalated"] },
      expiresAt: { lte: new Date() },
    },
  });

  for (const gate of gates) {
    const effectiveAction = gate.expiryAction ?? "reject";
    const approvalStatus = effectiveAction === "approve" ? "approved" : "rejected";

    await dbClient.approvalGate.update({
      where: { id: gate.id },
      data: { status: "expired", decidedAt: new Date() },
    });

    await dbClient.scan.update({
      where: { id: gate.scanId },
      data: { approvalStatus },
    });

    if (effectiveAction === "approve") {
      await bus.publish("sentinel.approvals", {
        type: "gate.decided",
        gateId: gate.id,
        decision: "approve",
        scanId: gate.scanId,
        orgId: gate.orgId,
        autoExpired: true,
      });
    }

    await bus.publish("sentinel.notifications", {
      id: `evt-${gate.id}-expired`,
      orgId: gate.orgId,
      topic: "approval.expired",
      payload: {
        gateId: gate.id,
        scanId: gate.scanId,
        expiryAction: effectiveAction,
      },
      timestamp: new Date().toISOString(),
    });
  }

  return gates.length;
}

// ---------------------------------------------------------------------------
// Main entry point (only runs when executed directly, not when imported)
// ---------------------------------------------------------------------------

const isMainModule =
  process.argv[1]?.endsWith("approval-worker.js") ||
  process.argv[1]?.endsWith("approval-worker.ts");

if (isMainModule) {
  (async () => {
    const { Redis } = await import("ioredis");
    const { EventBus } = await import("@sentinel/events");
    const { getDb, disconnectDb } = await import("@sentinel/db");
    const { createLogger } = await import("@sentinel/telemetry");
    const http = await import("node:http");

    const logger = createLogger({ name: "approval-worker" });

    const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
    const SWEEP_INTERVAL_MS = Number(process.env.SWEEP_INTERVAL_MS ?? 30_000);
    const HEALTH_PORT = Number(process.env.APPROVAL_WORKER_PORT ?? 8083);

    const redis = new Redis(REDIS_URL);
    const bus = new EventBus(redis);
    const db = getDb();

    let shuttingDown = false;

    // --- Health server ---
    const healthServer = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", worker: "approval" }));
    });
    healthServer.listen(HEALTH_PORT, () => {
      logger.info(`Approval worker health server on :${HEALTH_PORT}`);
    });

    // --- Sweep timer ---
    async function sweep() {
      if (shuttingDown) return;
      try {
        const escalated = await processEscalations(db, bus);
        const expired = await processExpirations(db, bus);
        if (escalated > 0 || expired > 0) {
          logger.info({ escalated, expired }, "Sweep complete");
        }
      } catch (err) {
        logger.error({ err }, "Sweep failed");
      }
    }

    const sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS);
    // Run initial sweep immediately
    await sweep();

    // --- Approval event consumer ---
    const GROUP = "approval-worker";
    const CONSUMER = `approval-${process.pid}`;
    const STREAM = "sentinel.approvals";

    try {
      await redis.xgroup("CREATE", STREAM, GROUP, "0", "MKSTREAM");
    } catch {
      // Group may already exist
    }

    async function consumeLoop() {
      while (!shuttingDown) {
        try {
          const results = await redis.xreadgroup(
            "GROUP",
            GROUP,
            CONSUMER,
            "COUNT",
            10,
            "BLOCK",
            5000,
            "STREAMS",
            STREAM,
            ">",
          );

          if (!results) continue;

          for (const entry of results as [string, [string, string[]][]][]) {
            const [, messages] = entry;
            for (const [msgId, fields] of messages) {
              try {
                await handleApprovalEvent(fields, db, bus);
                await redis.xack(STREAM, GROUP, msgId);
              } catch (err) {
                logger.error({ err, msgId }, "Failed to process approval event");
              }
            }
          }
        } catch (err) {
          if (!shuttingDown) {
            logger.error({ err }, "Consumer loop error");
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }
    }

    async function handleApprovalEvent(fields: string[], db: any, bus: any) {
      // Parse the event payload from Redis stream fields
      const data: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        data[fields[i]] = fields[i + 1];
      }

      const payload = data.payload ? JSON.parse(data.payload) : data;

      if (payload.type === "gate.decided" && payload.decision === "approve") {
        logger.info(
          { gateId: payload.gateId, scanId: payload.scanId },
          "Issuing certificate for approved scan",
        );

        // Publish certificate issuance request
        await bus.publish("sentinel.certificates", {
          type: "certificate.issue",
          scanId: payload.scanId,
          orgId: payload.orgId,
          gateId: payload.gateId,
          autoExpired: payload.autoExpired ?? false,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Start consumer
    consumeLoop().catch((err) => {
      logger.error({ err }, "Consumer loop crashed");
      process.exit(1);
    });

    // --- Graceful shutdown ---
    async function shutdown(signal: string) {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info({ signal }, "Shutting down approval worker");

      clearInterval(sweepTimer);
      healthServer.close();

      try {
        await disconnectDb();
        redis.disconnect();
      } catch {
        // Best-effort cleanup
      }

      process.exit(0);
    }

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  })();
}
