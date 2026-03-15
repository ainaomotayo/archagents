import type { VcsProvider, VcsProviderType } from "./types.js";

export class VcsProviderRegistry {
  private providers = new Map<VcsProviderType, VcsProvider>();

  register(provider: VcsProvider): void {
    if (this.providers.has(provider.type)) {
      throw new Error(`Provider ${provider.type} already registered`);
    }
    this.providers.set(provider.type, provider);
  }

  get(type: VcsProviderType): VcsProvider | undefined {
    return this.providers.get(type);
  }

  has(type: VcsProviderType): boolean {
    return this.providers.has(type);
  }

  list(): VcsProviderType[] {
    return [...this.providers.keys()];
  }
}
