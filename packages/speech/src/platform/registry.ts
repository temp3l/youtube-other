import type { SpeechProvider, SpeechProviderId } from "./contracts.js";
import { SpeechDomainError } from "./errors.js";

export class SpeechProviderRegistry {
  private readonly providers = new Map<SpeechProviderId, SpeechProvider>();
  public constructor(providers: readonly SpeechProvider[]) {
    for (const provider of providers) this.register(provider);
  }
  public register(provider: SpeechProvider): void {
    if (this.providers.has(provider.id))
      throw new Error(`Duplicate speech provider registration: ${provider.id}`);
    this.providers.set(provider.id, provider);
  }
  public get(id: SpeechProviderId): SpeechProvider {
    const provider = this.providers.get(id);
    if (!provider)
      throw new SpeechDomainError(
        "SPEECH_PROVIDER_DISABLED",
        `Speech provider ${id} is not enabled.`
      );
    return provider;
  }
}
