"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useAsync } from "@/hooks/useAsync";
import { listShipments } from "@/services/shipments/actions";
import { SHIPMENT_STATES, SHIPMENT_STATE_LABELS, type ShipmentDTO } from "@/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select as UISelect } from "@/components/ui/Input";
import { EmptyState, Loading, PageHeader } from "@/components/ui/Feedback";
import { FilterBar, Pagination, SearchBar, Table } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badges";
import { formatDate, formatMoney, shipmentCode } from "@/utils/format";

const initialFilters = { q: "", estado: "", desde: "", hasta: "", page: 1, pageSize: 15 };

export default function OrdersPage() {
  const params = useSearchParams();
  const [f, setF] = useState({
    q: params.get("q") ?? "",
    estado: params.get("estado") ?? "",
    desde: params.get("desde") ?? "",
    hasta: params.get("hasta") ?? "",
    page: Number(params.get("page")) ?? 1,
    pageSize: Number(params.get("pageSize")) ?? 15,
  });

  const onSearch = useCallback((q: string) => setF({ q, estado: f.estado, desde: f.desde, hasta: f.hasta, page: 1, pageSize: f.pageSize }), [f]);
  const onFilterEstado = useCallback((e: string | React.ChangeEvent<HTMLSelectElement>) => setF({ ...f, estado: typeof e === "string" ? e : (e.target ?? e).value ?? "" }), [f]);
  const onFilterFecha = useCallback((desde: string, hasta: string) => setF({ ...f, desde, hasta, page: 1 }), [f]);
  const onPageChange = useCallback((page: number, pageSize: number) => setF({ ...f, page, pageSize }), [f]);

  const renderColumns = () => [
    { key: "id", header: "N°", render: (s: ShipmentDTO) => <span className="font-mono text-xs font-semibold">{shipmentCode(s.id)}</span> },
    { key: "c", header: "Cliente", render: (s: ShipmentDTO) => (
      <div className="min-w-[150px]">
        <p className="font-medium">{s.clienteNombre}</p>
        <p className="text-xs text-slate-500">{s.clienteEmpresa || s.telefono}</p>
      </div>
    )},
    { key: "d", header: "Ciudad", render: (s: ShipmentDTO) => (
      <div className="min-w-[140px]">
        <p className="text-xs text-slate-500">Ciudad</p>
        <p className="font-medium">{s.ciudad}</p>
      </div>
    )},
    { key: "e", header: "Fechas", render: (s: ShipmentDTO) => (
      <div>
        <p className="text-xs text-slate-500">Creado</p>
        <p>{formatDate(s.createdAt)}</p>
      </div>
    )},
    { key: "i", header: "Items", render: (s: ShipmentDTO) => <div className="text-right font-medium">{s.itemCount ?? 0} item{s.itemCount !== 1 ? "s" : ""}</div> },
    { key: "t", header: "Total", render: (s: ShipmentDTO) => <div className="text-right font-medium">{formatMoney(s.total)}</div> },
    { key: "e2", header: "Estado", render: (s: { estado: string }) => <Badge tone={s.estado === "entregado" ? "green" : s.estado === "cancelado" ? "red" : "amber"}>
      {SHIPMENT_STATE_LABELS[s.estado as keyof typeof SHIPMENT_STATE_LABELS]}
    </Badge> },
  ];

  const { data, loading } = useAsync(() => listShipments({}), []);
  const rows = data?.rows ?? [];

  if (loading || !rows.length) {
    return (
      <Suspense fallback={<Loading />}>
        <PageHeader title="Historial de ventas" description="Ventas pasadas">
          <EmptyState title="No hay ventas registradas" description="Ventas pasadas" />
        </PageHeader>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<Loading />}>
      <PageHeader title="Historial de ventas" description="Ventas pasadas con detalle de productos y cliente">
        <div className="mt-4">
          <SearchBar
            placeholder="Buscar por cliente, empresa o N° de envío..."
            value={f.q}
            onChange={onSearch}
          />
          <UISelect
  options={[
    { value: "", label: "Todos" },
    { value: "pendiente", label: "Pendiente" },
    { value: "preparando", label: "Preparando" },
    { value: "listo", label: "Listo" },
    { value: "enviado", label: "Enviado" },
    { value: "entregado", label: "Entregado" },
    { value: "cancelado", label: "Cancelado" },
  ]}
  placeholder="Filtrar por estado"
  value={f.estado ?? ""}
  onChange={onFilterEstado}
></UISelect>

<UISelect
  options={[
    { value: "15", label: "15 por página" },
    { value: "30", label: "30 por página" },
    { value: "50", label: "50 por página" },
  ]}
  placeholder="Filtrar por página"
  value={String(f.pageSize)}
  onChange={(e) => onPageChange(f.page, Number((e.target ?? e).value))}
></UISelect>
        </div>
      </PageHeader>
      <Table<ShipmentDTO>
        rows={rows}
        rowKey={(s) => s.id}
        
        columns={renderColumns()}
      />

      <Pagination
        total={data?.total ?? 0}
        page={f.page}
        onChange={(page) => onPageChange(page, f.pageSize)}
        pageSize={f.pageSize}
      />
    </Suspense>
  );
}