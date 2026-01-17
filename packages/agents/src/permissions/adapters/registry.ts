import type { Platform } from '../types.js';
import type { PlatformApprovalAdapter } from './base.js';

export class PlatformAdapterRegistry {
  private adapters = new Map<Platform, PlatformApprovalAdapter>();

  register(adapter: PlatformApprovalAdapter): void {
    this.adapters.set(adapter.platform, adapter);
  }

  unregister(platform: Platform): void {
    this.adapters.delete(platform);
  }

  get(platform: Platform): PlatformApprovalAdapter | undefined {
    return this.adapters.get(platform);
  }

  list(): PlatformApprovalAdapter[] {
    return Array.from(this.adapters.values());
  }
}
