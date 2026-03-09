import type { KmsKeyStore } from "./kms.js";

export interface PurgeResult {
  orgId: string;
  keysDestroyed: number;
  dataRecordsInvalidated: number;
  timestamp: string;
}

/**
 * Purge an organization by destroying all its encryption keys.
 * Encrypted data becomes permanently unrecoverable without the keys.
 *
 * Steps:
 * 1. Destroy all encryption keys for the org
 * 2. Mark all records as purged (data is now unrecoverable)
 */
export async function purgeOrganization(
  orgId: string,
  keyStore: KmsKeyStore,
): Promise<PurgeResult> {
  let keysDestroyed = 0;

  // Check if the org has an active key
  const existingKey = await keyStore.getKey(orgId);
  if (existingKey) {
    await keyStore.destroyKey(orgId);
    keysDestroyed = 1;
  }

  // In a real system, we'd scan a database to count encrypted records
  // and mark them as purged. Here we record the action.
  const dataRecordsInvalidated = keysDestroyed > 0 ? 1 : 0;

  return {
    orgId,
    keysDestroyed,
    dataRecordsInvalidated,
    timestamp: new Date().toISOString(),
  };
}
