import type { SsoProvider, SsoProviderType } from "./types.js";

export class ProviderRegistry {
  private providers = new Map<string, SsoProvider>();

  register(provider: SsoProvider): void {
    this.providers.set(provider.id, provider);
  }

  resolve(type: SsoProviderType | string): SsoProvider | undefined {
    return this.providers.get(type);
  }

  has(type: SsoProviderType | string): boolean {
    return this.providers.has(type);
  }

  listAll(): SsoProvider[] {
    return Array.from(this.providers.values());
  }
}
