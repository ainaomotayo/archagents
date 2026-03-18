// @sentinel/retention — Data retention policy management
export { RETENTION_PRESETS, validateTierValues, getPresetByName, detectPreset } from "./policy.js";
export type { TierValues, RetentionPreset, ValidationResult } from "./policy.js";
export { encryptCredential, decryptCredential } from "./credential.js";
export type { EncryptedData } from "./credential.js";
export { registerAdapter, getArchiveAdapter, listAdapterTypes } from "./ports/registry.js";
export type { ArchivePort, ArchiveConfig, ArchivePayload, ArchiveResult } from "./ports/archive-port.js";
