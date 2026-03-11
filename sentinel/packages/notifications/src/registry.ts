import type { ChannelAdapter, ChannelType } from "./types.js";

export class AdapterRegistry {
  private adapters = new Map<ChannelType, ChannelAdapter>();

  register(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  get(type: ChannelType): ChannelAdapter | undefined {
    return this.adapters.get(type);
  }

  has(type: ChannelType): boolean {
    return this.adapters.has(type);
  }
}
