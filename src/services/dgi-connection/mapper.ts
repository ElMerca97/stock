import type { SaleReceipt } from "@/services/shipments/actions";
import { getBusinessConfig } from "@/config/business";
import type { FiscalSaleInput } from "./types";

export function mapSaleReceiptToFiscalInput(receipt: SaleReceipt): FiscalSaleInput {
  const business = getBusinessConfig();

  return {
    saleId: receipt.id,
    createdAt: receipt.createdAt,
    customerName: receipt.customerName,
    items: receipt.items.map((item) => ({
      productoId: 0,
      nombre: item.nombre,
      sku: item.sku,
      cantidad: item.cantidad,
      precioUnitario: item.precioUnitario,
      subtotal: item.subtotal,
    })),
    subtotal: Number(receipt.subtotal),
    descuentoPorcentaje: Number(receipt.descuentoPorcentaje),
    descuentoImporte: Number(receipt.descuentoImporte),
    total: Number(receipt.total),
    moneda: business.moneda,
    businessName: business.nombreComercial,
    businessRut: business.rut,
    businessAddress: business.direccionFiscal,
  };
}

export function mapShipmentToSaleItems(items: Array<{ productoId: number; nombre: string; sku: string; cantidad: number; precioUnitario: number; subtotal: number }>) {
  return items.map((item) => ({
    productoId: item.productoId,
    nombre: item.nombre,
    sku: item.sku,
    cantidad: item.cantidad,
    precioUnitario: item.precioUnitario,
    subtotal: item.subtotal,
  }));
}
