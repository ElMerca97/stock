import type { FiscalConfig, FiscalDocument, IssueCfeResult, ProviderHealth } from "../types";

/**
 * Contrato que debe implementar cualquier proveedor de facturación electrónica.
 *
 * La implementación concreta se selecciona por configuración, lo que permite
 * cambiar de proveedor sin tocar el módulo de ventas.
 */
export interface FiscalProvider {
  readonly name: string;

  /** Verifica conectividad y credenciales sin emitir documentos. */
  testConnection(config: FiscalConfig): Promise<ProviderHealth>;

  /** Emite (o reutiliza) un CFE para el documento fiscal indicado. */
  issueCfe(config: FiscalConfig, document: FiscalDocument): Promise<IssueCfeResult>;

  /** Consulta el estado de un CFE ya emitido. */
  getCfeStatus(config: FiscalConfig, providerDocumentId: string): Promise<IssueCfeResult>;
}
