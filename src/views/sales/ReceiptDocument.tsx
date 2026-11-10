"use client";

import type { SaleReceipt } from "@/services/shipments/actions";
import { formatDateTime, formatMoney, receiptCode } from "@/utils/format";

function ReceiptContent({ receipt }: { receipt: SaleReceipt }) {
  const { business } = receipt;

  return (
    <article className="receipt-document">
      {business.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="receipt-logo" src={business.logoUrl} alt="" />
      )}
      <header className="receipt-header">
        {business.nombre && <h1>{business.nombre.toUpperCase()}</h1>}
        <p>Gestión comercial y comprobante de venta.</p>
        <p>Comprobante comercial de venta. No constituye factura electrónica ni CFE.</p>
      </header>
      <div className="receipt-meta">
        <p><strong>Boleta:</strong> {receiptCode(receipt.id)}</p>
        <p><strong>Fecha:</strong> {formatDateTime(receipt.createdAt)}</p>
        <p><strong>Cliente:</strong> {receipt.customerName}</p>
        {receipt.cfeStatus && receipt.cfeStatus !== "not_configured" && (
          <p><strong>Estado fiscal:</strong> {receipt.cfeStatus}</p>
        )}
        {business.rut && <p><strong>RUT:</strong> {business.rut}</p>}
        {business.direccion && <p><strong>Dirección:</strong> {business.direccion}</p>}
        {business.telefono && <p><strong>Teléfono:</strong> {business.telefono}</p>}
      </div>
      <div className="receipt-rule" />
      <h2>Detalle de compra</h2>
      <div className="receipt-items">
        {receipt.items.map((item, index) => (
          <div className="receipt-item" key={`${item.sku}-${index}`}>
            <p className="receipt-item-name">{item.cantidad} × {item.nombre}</p>
            {item.sku && <p className="receipt-item-sku">SKU {item.sku}</p>}
            <div className="receipt-item-prices">
              <span>{formatMoney(item.precioUnitario)} c/u</span>
              <strong>{formatMoney(item.subtotal)}</strong>
            </div>
          </div>
        ))}
      </div>
      <div className="receipt-rule" />
      <div className="receipt-summary">
        <p><span>Subtotal</span><strong>{formatMoney(Number(receipt.subtotal))}</strong></p>
        {Number(receipt.descuentoImporte) > 0 && (
          <p><span>Descuento ({Number(receipt.descuentoPorcentaje)}%)</span><strong>−{formatMoney(Number(receipt.descuentoImporte))}</strong></p>
        )}
        <p className="receipt-total"><span>Total</span><strong>{formatMoney(Number(receipt.total))}</strong></p>
      </div>
      <footer className="receipt-footer">
        <p>¡Gracias por su compra!</p>
        {business.politicaDevolucion && <p>{business.politicaDevolucion}</p>}
        {(business.telefono || business.direccion) && (
          <p>{[business.telefono, business.direccion].filter(Boolean).join(" · ")}</p>
        )}
      </footer>
    </article>
  );
}

export function ReceiptDocument({ receipt, printable = true }: { receipt: SaleReceipt; printable?: boolean }) {
  return (
    <>
      <ReceiptContent receipt={receipt} />
      {printable && (
        <section className="print-receipt" aria-hidden="true">
          <ReceiptContent receipt={receipt} />
        </section>
      )}
    </>
  );
}
