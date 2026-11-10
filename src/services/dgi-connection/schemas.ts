import type { FiscalSaleInput, CfeType } from "./types";
import { FiscalValidationError } from "./errors";

const CFE_TYPES: CfeType[] = ["e-ticket", "e-factura", "nota-credito", "nota-debito"];

export function isCfeType(value: unknown): value is CfeType {
  return typeof value === "string" && CFE_TYPES.includes(value as CfeType);
}

export function validateFiscalSaleInput(input: FiscalSaleInput): void {
  if (!Number.isInteger(input.saleId) || input.saleId <= 0) {
    throw new FiscalValidationError("El identificador de venta no es válido.");
  }
  if (!input.items.length) {
    throw new FiscalValidationError("La venta no contiene líneas para emitir.");
  }
  for (const item of input.items) {
    if (item.productoId !== undefined && (!Number.isInteger(item.productoId) || item.productoId <= 0)) {
      throw new FiscalValidationError("Hay una línea de venta con producto inválido.");
    }
    if (!Number.isInteger(item.cantidad) || item.cantidad <= 0) {
      throw new FiscalValidationError("Hay una línea de venta con cantidad inválida.");
    }
    if (!Number.isFinite(item.precioUnitario) || item.precioUnitario < 0) {
      throw new FiscalValidationError("Hay una línea de venta con precio inválido.");
    }
  }
  if (!Number.isFinite(input.total) || input.total < 0) {
    throw new FiscalValidationError("El total de la venta no es válido.");
  }
}

export function validateCfeType(value: unknown): CfeType {
  if (!isCfeType(value)) {
    throw new FiscalValidationError("El tipo de comprobante fiscal no es válido.");
  }
  return value;
}
