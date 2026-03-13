const VALID_ATTESTATION_TYPES = [
  "compliant",
  "not_applicable",
  "compensating_control",
  "planned_remediation",
];

const DEFAULT_CADENCE_DAYS = 90;

const CADENCE_BY_TYPE: Record<string, number> = {
  compliant: DEFAULT_CADENCE_DAYS,
  not_applicable: 365,
  compensating_control: DEFAULT_CADENCE_DAYS,
  planned_remediation: 30,
};

export interface CreateAttestationInput {
  frameworkSlug: string;
  controlCode: string;
  attestedBy: string;
  attestationType: string;
  justification: string;
  evidenceUrls: string[];
  cadenceDays?: number;
}

export class AttestationService {
  constructor(private db: any) {}

  async create(orgId: string, input: CreateAttestationInput) {
    if (input.justification.length < 20) {
      throw new Error("Justification must be at least 20 characters");
    }
    if (!VALID_ATTESTATION_TYPES.includes(input.attestationType)) {
      throw new Error(`Invalid attestation type: ${input.attestationType}`);
    }

    const now = new Date();
    const cadence =
      input.cadenceDays ??
      CADENCE_BY_TYPE[input.attestationType] ??
      DEFAULT_CADENCE_DAYS;
    const expiresAt = new Date(now.getTime() + cadence * 86_400_000);

    // If an expired (but not revoked) attestation exists, replace it
    const existing = await this.db.controlAttestation.findFirst({
      where: {
        orgId,
        frameworkSlug: input.frameworkSlug,
        controlCode: input.controlCode,
        revokedAt: null,
      },
    });
    if (existing) {
      if (existing.expiresAt >= now) {
        throw new Error(
          `Active attestation already exists for ${input.frameworkSlug}/${input.controlCode}. Revoke it first or wait until it expires.`,
        );
      }
      // Expire the old one by soft-revoking
      await this.db.controlAttestation.update({
        where: { id: existing.id },
        data: { revokedAt: now, revokedBy: input.attestedBy, revokedReason: "Superseded by new attestation" },
      });
    }

    const attestation = await this.db.controlAttestation.create({
      data: {
        orgId,
        frameworkSlug: input.frameworkSlug,
        controlCode: input.controlCode,
        attestedBy: input.attestedBy,
        attestationType: input.attestationType,
        justification: input.justification,
        evidenceUrls: input.evidenceUrls,
        validFrom: now,
        expiresAt,
      },
    });

    await this.db.attestationHistory.create({
      data: {
        attestationId: attestation.id,
        action: "created",
        actorId: input.attestedBy,
      },
    });

    return attestation;
  }

  async renew(orgId: string, attestationId: string, actorId: string) {
    const existing = await this.db.controlAttestation.findUnique({
      where: { id: attestationId },
    });
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Attestation not found");
    }
    if (existing.revokedAt) {
      throw new Error("Cannot renew revoked attestation");
    }

    const cadence =
      CADENCE_BY_TYPE[existing.attestationType] ?? DEFAULT_CADENCE_DAYS;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + cadence * 86_400_000);

    const updated = await this.db.controlAttestation.update({
      where: { id: attestationId },
      data: { validFrom: now, expiresAt },
    });

    await this.db.attestationHistory.create({
      data: {
        attestationId,
        action: "renewed",
        actorId,
        previousState: {
          validFrom: existing.validFrom,
          expiresAt: existing.expiresAt,
        },
      },
    });

    return updated;
  }

  async revoke(
    orgId: string,
    attestationId: string,
    reason: string,
    actorId: string,
  ) {
    const existing = await this.db.controlAttestation.findUnique({
      where: { id: attestationId },
    });
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Attestation not found");
    }
    if (existing.revokedAt) {
      throw new Error("Attestation already revoked");
    }

    const updated = await this.db.controlAttestation.update({
      where: { id: attestationId },
      data: { revokedAt: new Date(), revokedBy: actorId, revokedReason: reason },
    });

    await this.db.attestationHistory.create({
      data: {
        attestationId,
        action: "revoked",
        actorId,
        previousState: { revokedAt: null },
      },
    });

    return updated;
  }

  async getActive(orgId: string, frameworkSlug: string) {
    return this.db.controlAttestation.findMany({
      where: {
        orgId,
        frameworkSlug,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  async getExpiring(orgId: string, days: number) {
    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 86_400_000);
    return this.db.controlAttestation.findMany({
      where: {
        orgId,
        revokedAt: null,
        expiresAt: { gt: now, lte: cutoff },
      },
    });
  }
}
