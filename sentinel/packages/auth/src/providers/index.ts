export type { SsoProvider, SsoProviderType, SsoConfigInput, StandardClaims, ValidationResult, ConnectionTestResult } from "./types.js";
export { ProviderRegistry } from "./registry.js";
export { OktaProvider } from "./okta.js";
export { AzureAdProvider } from "./azure-ad.js";
export { GoogleWorkspaceProvider } from "./google-workspace.js";
export { PingFederateProvider } from "./ping-federate.js";
export { GenericOidcProvider } from "./generic-oidc.js";
export { GenericSamlProvider } from "./generic-saml.js";

import { ProviderRegistry } from "./registry.js";
import { OktaProvider } from "./okta.js";
import { AzureAdProvider } from "./azure-ad.js";
import { GoogleWorkspaceProvider } from "./google-workspace.js";
import { PingFederateProvider } from "./ping-federate.js";
import { GenericOidcProvider } from "./generic-oidc.js";
import { GenericSamlProvider } from "./generic-saml.js";

export function createDefaultRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(new OktaProvider());
  registry.register(new AzureAdProvider());
  registry.register(new GoogleWorkspaceProvider());
  registry.register(new PingFederateProvider());
  registry.register(new GenericOidcProvider());
  registry.register(new GenericSamlProvider());
  return registry;
}
