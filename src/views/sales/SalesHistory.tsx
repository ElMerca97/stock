"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Eye, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/Feedback";
import { Modal } from "@/components/ui/Modal";
import { Pagination, Table, type Column } from "@/components/ui/Table";
import { useAsync } from "@/hooks/useAsync";
import { getSaleReceipt, listSales, type SaleHistoryRow, type SaleReceipt } from "@/services/shipments/actions";
import { formatDateTime, formatMoney, receiptCode } from "@/utils/format";
import { ReceiptDocument } from "./ReceiptDocument";

export function SalesHistory() {
  const [page, setPage] = useState(1);
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const printAfterLoad = useRef(false);
  const { data, loading, error, reload } = useAsync(() => listSales(page, 20), [page]);

  async function showReceipt(id: number, print = false) {
    setOpeningId(id);
    const result = await getSaleReceipt(id);
    setOpeningId(null);
    if (!result.ok) {
      printAfterLoad.current = false;
      return toast.error(result.error);
    }
    setReceipt(result.data);
    printAfterLoad.current = print;
  }

  useEffect(() => {
    if (!receipt || !printAfterLoad.current) return;
    printAfterLoad.current = false;
    const frame = requestAnimationFrame(() => {
      try {
        window.print();
      } catch {
        toast.error("El navegador no pudo abrir el diálogo de impresión.");
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [receipt]);

  function printReceipt() {
    try {
      window.print();
    } catch {
      toast.error("El navegador no pudo abrir el diálogo de impresión.");
    }
  }

  const columns: Column<SaleHistoryRow>[] = [
    { key: "number", header: "Boleta", render: (sale) => <span className="font-mono font-semibold">{receiptCode(sale.id)}</span> },
    { key: "date", header: "Fecha", render: (sale) => <span className="whitespace-nowrap">{formatDateTime(sale.createdAt)}</span> },
    { key: "customer", header: "Cliente", render: (sale) => sale.customerName },
    { key: "items", header: "Unidades", className: "text-right", render: (sale) => sale.itemCount },
    { key: "discount", header: "Descuento", className: "text-right", render: (sale) => sale.descuentoImporte > 0 ? `${sale.descuentoPorcentaje}% · ${formatMoney(sale.descuentoImporte)}` : "—" },
    { key: "total", header: "Total", className: "text-right", render: (sale) => <span className="font-semibold">{formatMoney(sale.total)}</span> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (sale) => (
        <div className="flex justify-end gap-1">
          <Button size="icon" variant="ghost" title="Ver boleta" aria-label="Ver boleta" onClick={() => void showReceipt(sale.id)}>
            <Eye className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" title="Imprimir boleta" aria-label="Imprimir boleta" disabled={openingId === sale.id} onClick={() => void showReceipt(sale.id, true)}>
            <Printer className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Historial de ventas"
        description="Consultá e imprimí nuevamente los comprobantes de ventas registradas."
        actions={<Link href="/sales" className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">Nueva venta</Link>}
      />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : (
        <div className="card overflow-hidden">
          <Table
            columns={columns}
            rows={data?.rows}
            loading={loading}
            error={null}
            onRetry={() => void reload()}
            rowKey={(sale) => sale.id}
            empty={<EmptyState title="Sin ventas" description="Las ventas confirmadas aparecerán aquí." />}
          />
          {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
        </div>
      )}
      <Modal
        open={receipt !== null}
        onClose={() => setReceipt(null)}
        title={receipt ? `Boleta ${receiptCode(receipt.id)}` : "Boleta"}
        size="sm"
        footer={receipt && <Button onClick={printReceipt}><Printer className="h-4 w-4" /> Imprimir boleta</Button>}
      >
        {receipt && <ReceiptDocument receipt={receipt} printable={false} />}
      </Modal>
      {receipt && <ReceiptDocument receipt={receipt} />}
    </div>
  );
}
