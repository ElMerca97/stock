/**
 * Tipos del módulo DGI-Connection.
 *
 * El módulo es independiente del POS. No asume la existencia de una API pública
 * directa de DGI: la comunicación se realiza a través de un proveedor de
 * facturación electrónica configurado por el negocio.
 */

export type CfeType = "e-ticket" | "e-factura" | "nota-credito" | "nota-debito";

export type CfeStatus =
  | "pending"
  | "processing"
  | "issued"
  | "failed"
  | "cancelled"
  | "not_configured";

export type FiscalEnvironment = "testing" | "homologacion" | "produccion";

export type FiscalProviderName = "none" | "generic-http";

export interface FiscalConfig {
  enabled: boolean;
  provider: FiscalProviderName;
  environment: FiscalEnvironment;
  apiBaseUrl: string | null;
  apiKey: string | null;
  apiSecret: string | null;
  clientId: string | null;
  clientSecret: string | null;
  certificateRef: string | null;
  ruc: string | null;
  razonSocial: string | null;
  timeoutMs: number;
}

export interface FiscalSaleItem {
  productoId?: number;
  nombre: string;
  sku: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface FiscalSaleInput {
  saleId: number;
  createdAt: string;
  customerName: string;
  customerRut?: string | null;
  customerAddress?: string | null;
  items: FiscalSaleItem[];
  subtotal: number;
  descuentoPorcentaje: number;
  descuentoImporte: number;
  total: number;
  moneda: string;
  businessName: string;
  businessRut: string | null;
  businessAddress: string | null;
}

export interface FiscalDocument {
  type: CfeType;
  currency: string;
  issuer: {
    name: string;
    rut: string | null;
    address: string | null;
  };
  customer: {
    name: string;
    rut: string | null;
    address: string | null;
  };
  lines: Array<{
    lineNumber: number;
    sku: string;
    description: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  totals: {
    subtotal: number;
    discount: number;
    total: number;
  };
  metadata: {
    saleId: number;
    createdAt: string;
    environment: FiscalEnvironment;
  };
}

export interface ProviderHealth {
  ok: boolean;
  message: string;
  checkedAt: string;
}

export interface IssueCfeResult {
  ok: boolean;
  status: CfeStatus;
  providerDocumentId: string | null;
  serie: string | null;
  numero: string | null;
  authorizationCode: string | null;
  documentUrl: string | null;
  issuedAt: string | null;
  rawResponse: Record<string, unknown> | null;
  error: string | null;
}

export interface CfeRecord {
  id: number;
  saleId: number;
  cfeType: CfeType;
  serie: string | null;
  numero: string | null;
  provider: string;
  providerDocumentId: string | null;
  status: CfeStatus;
  issuedAt: string | null;
  authorizationCode: string | null;
  documentUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FiscalSettings {
  enabled: boolean;
  provider: FiscalProviderName;
  environment: FiscalEnvironment;
  defaultCfeType: CfeType;
  updatedAt: string | null;
  updatedBy: string | null;
}
