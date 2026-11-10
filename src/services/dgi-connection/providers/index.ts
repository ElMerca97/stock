import type { FiscalConfig } from "../types";
import { ProviderNotConfiguredError } from "../errors";
import type { FiscalProvider } from "./provider.interface";

class UnconfiguredProvider implements FiscalProvider {
  readonly name = "unconfigured";

  async testConnection(): Promise<never> {
    throw new ProviderNotConfiguredError();
  }

  async issueCfe(): Promise<never> {
    throw new ProviderNotConfiguredError();
  }

  async getCfeStatus(): Promise<never> {
    throw new ProviderNotConfiguredError();
  }
}

export function getProvider(config: FiscalConfig): FiscalProvider {
  if (!config.enabled || config.provider === "none") {
    return new UnconfiguredProvider();
  }
  // No se incluyen adaptadores reales: deben agregarse por proveedor contratado.
  return new UnconfiguredProvider();
}
