import type { EnvelopeEncryption } from "@sentinel/security";

interface FieldConfig {
  fields: string[];
  mode: "envelope" | "deterministic";
  purpose: string;
}

export const ENCRYPTED_FIELDS: Record<string, FieldConfig> = {
  SsoConfig: { fields: ["clientId", "clientSecret", "scimToken", "samlMetadata"], mode: "envelope", purpose: "sso_secrets" },
  WebhookEndpoint: { fields: ["secret", "url", "headers"], mode: "envelope", purpose: "webhook_secret" },
  Certificate: { fields: ["signature"], mode: "envelope", purpose: "certificate" },
  User: { fields: ["email", "externalId", "name"], mode: "deterministic", purpose: "user_lookup" },
};

type OrgIdResolver = () => string | null;

export function createEncryptionMiddleware(
  envelope: EnvelopeEncryption,
  getOrgId: OrgIdResolver,
) {
  return async (params: any, next: (params: any) => Promise<any>) => {
    const config = params.model ? ENCRYPTED_FIELDS[params.model] : undefined;
    if (!config) return next(params);

    const orgId = getOrgId();
    if (!orgId) return next(params);

    // WRITE: encrypt before DB write
    if (["create", "update", "upsert", "createMany"].includes(params.action)) {
      if (params.action === "upsert") {
        await encryptFields(params.args.create, config, orgId, envelope);
        await encryptFields(params.args.update, config, orgId, envelope);
      } else {
        const dataItems = Array.isArray(params.args.data) ? params.args.data : [params.args.data];
        for (const data of dataItems) {
          await encryptFields(data, config, orgId, envelope);
        }
      }
    }

    // WHERE: encrypt deterministic lookup fields
    if (config.mode === "deterministic" && params.args?.where) {
      await encryptFields(params.args.where, config, orgId, envelope);
    }

    const result = await next(params);

    if (result && config.fields.length > 0) {
      await decryptResult(result, config, orgId, envelope);
    }

    return result;
  };
}

async function encryptFields(
  data: Record<string, any> | undefined | null,
  config: FieldConfig,
  orgId: string,
  envelope: EnvelopeEncryption,
): Promise<void> {
  if (!data) return;
  for (const field of config.fields) {
    if (data[field] != null && typeof data[field] === "string") {
      data[field] = config.mode === "deterministic"
        ? await envelope.encryptDeterministic(orgId, config.purpose, data[field])
        : await envelope.encrypt(orgId, config.purpose, data[field]);
    }
  }
}

async function decryptResult(
  result: any,
  config: FieldConfig,
  orgId: string,
  envelope: EnvelopeEncryption,
): Promise<void> {
  const items = Array.isArray(result) ? result : [result];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    for (const field of config.fields) {
      if (item[field] != null && typeof item[field] === "string") {
        try {
          item[field] = config.mode === "deterministic"
            ? await envelope.decryptDeterministic(orgId, config.purpose, item[field])
            : await envelope.decrypt(orgId, config.purpose, item[field]);
        } catch {
          // Leave as-is if decryption fails (may be plaintext during migration)
        }
      }
    }
  }
}
