import { AttestationService } from "@sentinel/compliance";

interface AttestationRouteDeps {
  db: any;
}

export function buildAttestationRoutes(deps: AttestationRouteDeps) {
  const { db } = deps;
  const service = new AttestationService(db);

  return {
    async createAttestation(orgId: string, body: any) {
      return service.create(orgId, body);
    },

    async listAttestations(orgId: string, frameworkSlug?: string) {
      if (frameworkSlug) {
        return service.getActive(orgId, frameworkSlug);
      }
      return db.controlAttestation.findMany({
        where: { orgId, revokedAt: null, expiresAt: { gt: new Date() } },
      });
    },

    async getAttestation(orgId: string, id: string) {
      const att = await db.controlAttestation.findUnique({
        where: { id },
        include: { history: { orderBy: { createdAt: "desc" } } },
      });
      if (!att || att.orgId !== orgId) return null;
      return att;
    },

    async revokeAttestation(
      orgId: string,
      id: string,
      reason: string,
      actorId: string,
    ) {
      return service.revoke(orgId, id, reason, actorId);
    },

    async getExpiringAttestations(orgId: string, days: number = 14) {
      return service.getExpiring(orgId, days);
    },
  };
}
