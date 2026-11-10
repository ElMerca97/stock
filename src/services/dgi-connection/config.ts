import type { FiscalConfig, FiscalEnvironment, FiscalProviderName } from "./types";

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function boolEnv(name: string): boolean {
  return process.env[name]?.trim().toLowerCase() === "true";
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getDgiConfig(): FiscalConfig {
  return {
    enabled: boolEnv("DGI_ENABLED"),
    provider: (env("DGI_PROVIDER") as FiscalProviderName) || "none",
    environment: (env("DGI_ENVIRONMENT") as FiscalEnvironment) || "homologacion",
    apiBaseUrl: env("DGI_API_BASE_URL"),
    apiKey: env("DGI_API_KEY"),
    apiSecret: env("DGI_API_SECRET"),
    clientId: env("DGI_CLIENT_ID"),
    clientSecret: env("DGI_CLIENT_SECRET"),
    certificateRef: env("DGI_CERTIFICATE_REF"),
    ruc: env("BUSINESS_RUT"),
    razonSocial: env("BUSINESS_LEGAL_NAME"),
    timeoutMs: numberEnv("DGI_TIMEOUT_MS", 15000),
  };
}

export function isDgiConfigured(): boolean {
  const config = getDgiConfig();
  if (!config.enabled) return false;
  if (config.provider === "none") return false;
  if (!config.apiBaseUrl) return false;
  if (!config.apiKey && !config.clientId) return false;
  return true;
}
