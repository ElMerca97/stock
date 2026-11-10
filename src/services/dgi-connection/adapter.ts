import type { FiscalDocument, FiscalSaleInput } from "./types";
import { getDgiConfig } from "./config";

export function toFiscalDocument(input: FiscalSaleInput, cfeType: "e-ticket" | "e-factura" | "nota-credito" | "nota-debito"): FiscalDocument {
  const config = getDgiConfig();

  return {
    type: cfeType,
    currency: input.moneda,
    issuer: {
      name: input.businessName,
      rut: input.businessRut,
      address: input.businessAddress,
    },
    customer: {
      name: input.customerName,
      rut: input.customerRut ?? null,
      address: input.customerAddress ?? null,
    },
    lines: input.items.map((item, index) => ({
      lineNumber: index + 1,
      sku: item.sku,
      description: item.nombre,
      quantity: item.cantidad,
      unitPrice: item.precioUnitario,
      subtotal: item.subtotal,
    })),
    totals: {
      subtotal: input.subtotal,
      discount: input.descuentoImporte,
      total: input.total,
    },
    metadata: {
      saleId: input.saleId,
      createdAt: input.createdAt,
      environment: config.environment,
    },
  };
}
