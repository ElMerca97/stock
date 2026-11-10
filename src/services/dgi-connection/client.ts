import { ProviderNotConfiguredError } from "./errors";
import type { FiscalConfig } from "./types";

export interface HttpRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH";
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export async function requestJson<T = unknown>(
  config: FiscalConfig,
  options: HttpRequestOptions,
): Promise<T> {
  if (!config.apiBaseUrl) throw new ProviderNotConfiguredError();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const url = new URL(options.path, config.apiBaseUrl).toString();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      ...(options.headers ?? {}),
    };

    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }
    }

    if (!response.ok) {
      throw new Error(
        `El proveedor respondió ${response.status}: ${text.slice(0, 300)}`,
      );
    }
    return parsed as T;
  } finally {
    clearTimeout(timeout);
  }
}
