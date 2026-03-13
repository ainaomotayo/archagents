export interface RegisterBAAInput {
  vendorName: string;
  vendorContact: string;
  agreementDate: Date;
  expiresAt: Date;
  documentUrl?: string;
  coveredServices: string[];
  reviewedBy: string;
}

export interface UpdateBAAInput {
  vendorContact?: string;
  expiresAt?: Date;
  documentUrl?: string;
  coveredServices?: string[];
  reviewedBy?: string;
}

export class BAARegistryService {
  constructor(private db: any) {}

  async register(orgId: string, input: RegisterBAAInput) {
    return this.db.businessAssociateAgreement.create({
      data: {
        orgId,
        vendorName: input.vendorName,
        vendorContact: input.vendorContact,
        agreementDate: input.agreementDate,
        expiresAt: input.expiresAt,
        documentUrl: input.documentUrl,
        status: "active",
        coveredServices: input.coveredServices,
        reviewedBy: input.reviewedBy,
        reviewedAt: new Date(),
      },
    });
  }

  async update(orgId: string, id: string, input: UpdateBAAInput) {
    const existing = await this.db.businessAssociateAgreement.findUnique({ where: { id } });
    if (!existing || existing.orgId !== orgId) {
      throw new Error("BAA not found");
    }

    const data: any = {};
    if (input.vendorContact !== undefined) data.vendorContact = input.vendorContact;
    if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt;
    if (input.documentUrl !== undefined) data.documentUrl = input.documentUrl;
    if (input.coveredServices !== undefined) data.coveredServices = input.coveredServices;
    if (input.reviewedBy !== undefined) {
      data.reviewedBy = input.reviewedBy;
      data.reviewedAt = new Date();
    }

    return this.db.businessAssociateAgreement.update({ where: { id }, data });
  }

  async terminate(orgId: string, id: string) {
    const existing = await this.db.businessAssociateAgreement.findUnique({ where: { id } });
    if (!existing || existing.orgId !== orgId) {
      throw new Error("BAA not found");
    }

    return this.db.businessAssociateAgreement.update({
      where: { id },
      data: { status: "terminated" },
    });
  }

  async list(orgId: string) {
    return this.db.businessAssociateAgreement.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
    });
  }

  async getExpiring(orgId: string, days: number) {
    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 86400000);
    return this.db.businessAssociateAgreement.findMany({
      where: {
        orgId,
        status: "active",
        expiresAt: { gt: now, lte: cutoff },
      },
    });
  }
}
