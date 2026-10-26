"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Eye, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAsync } from "@/hooks/useAsync";
import { useAlerts } from "@/components/layout/AppShell";
import { changeShipmentStatus, getShipment, listShipments, type ShipmentFilters } from "@/services/shipments/actions";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { EmptyState, Loading, PageHeader } from "@/components/ui/Feedback";
import { FilterBar, Pagination, SearchBar, Table, type Column } from "@/components/ui/Table";
import { Badge, StatusBadge } from "@/components/ui/Badges";
import { ShipmentFormModal } from "./ShipmentFormModal";
import { SHIPMENT_STATES, SHIPMENT_STATE_LABELS, STOCK_DEDUCTED_STATES, type ShipmentDTO, type ShipmentState } from "@/types";
import { formatDate, formatDateTime, formatMoney, shipmentCode } from "@/utils/format";

const initial: ShipmentFilters = { q: "", estado: "", desde: "", hasta: "", page: 1, pageSize: 15 };

export function ShipmentsView() {
  const params = useSearchParams();
  const { refreshAlerts } = useAlerts();
  const [f, setF] = useState<ShipmentFilters>({ ...initial, q: params.get("q") ?? "", estado: params.get("estado") ?? "" });
  const upd = useCallback((patch: Partial<ShipmentFilters>) => setF((p) => ({ ...p, ...patch, page: patch.page ?? 1 })), []);
  const onSearch = useCallback((q: string) => upd({ q }), [upd]);
  const { data, loading, error, reload } = useAsync(() => listShipments(f), [JSON.stringify(f)]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ShipmentDTO | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const detail = useAsync(() => (detailId ? getShipment(detailId) : Promise.resolve({ ok: true as const, data: null })), [detailId]);
  const [pending, setPending] = useState<{ s: ShipmentDTO; estado: ShipmentState } | null>(null);
  const [busy, setBusy] = useState(false);

  async function openEdit(id: number) {
    const r = await getShipment(id);
    if (!r.ok) return toast.error(r.error);
    setEditing(r.data);
    setFormOpen(true);
  }

  function requestStatus(s: ShipmentDTO, estado: ShipmentState) {
    const deducts = STOCK_DEDUCTED_STATES.includes(estado) && !s.stockDescontado;
    const restores = (estado === "cancelado" || estado === "pendiente") && s.stockDescontado;
    if (deducts || restores || estado === "cancelado" || estado === "entregado") setPending({ s, estado });
    else void applyStatus(s, estado);
  }

  async function applyStatus(s: ShipmentDTO, estado: ShipmentState) {
    setBusy(true);
    const r = await changeShipmentStatus(s.id, estado);
    setBusy(false);
    setPending(null);
    if (!r.ok) return toast.error(r.error);
    toast.success(`${shipmentCode(s.id)} → ${SHIPMENT_STATE_LABELS[estado]}`);
    void reload();
    void detail.reload();
    void refreshAlerts();
  }

  const columns: Column<ShipmentDTO>[] = [
    { key: "id", header: "N°", render: (s) => <span className="font-mono text-xs font-semibold">{shipmentCode(s.id)}</span> },
    { key: "c", header: "Cliente", render: (s) => <div className="min-w-[150px]"><p className="font-medium">{s.clienteNombre}</p><p className="text-xs text-slate-500">{s.clienteEmpresa || s.telefono}</p></div> },
    { key: "d", header: "Destino", render: (s) => <div className="min-w-[140px] text-xs"><p>{s.direccion}</p><p className="text-slate-500">{s.ciudad}</p></div> },
    { key: "i", header: "Unid.", className: "text-right", render: (s) => s.itemCount },
    { key: "t", header: "Total", className: "text-right", render: (s) => <span className="font-semibold whitespace-nowrap">{formatMoney(s.total)}</span> },
    { key: "f", header: "Creado", render: (s) => <span className="whitespace-nowrap">{formatDate(s.createdAt)}</span> },
    { key: "fe", header: "Envío", render: (s) => <span className="whitespace-nowrap">{formatDate(s.fechaEnvio)}</span> },
    {
      key: "e",
      header: "Estado",
      render: (s) =>
        s.estado === "entregado" || s.estado === "cancelado" ? (
          <StatusBadge estado={s.estado} />
        ) : (
          <select
            value={s.estado}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => requestStatus(s, e.target.value as ShipmentState)}
            className="input-base h-8 w-auto py-0 text-xs"
            aria-label="Cambiar estado"
          >
            {SHIPMENT_STATES.map((st) => <option key={st} value={st}>{SHIPMENT_STATE_LABELS[st]}</option>)}
          </select>
        ),
    },
    {
      key: "a",
      header: "",
      className: "text-right",
      render: (s) => (
        <div className="flex justify-end gap-1">
          <Button size="icon" variant="ghost" onClick={() => setDetailId(s.id)} aria-label="Ver detalle" title="Ver detalle"><Eye className="h-4 w-4" /></Button>
          {s.estado === "pendiente" && <Button size="icon" variant="ghost" onClick={() => openEdit(s.id)} aria-label="Editar" title="Editar"><Pencil className="h-4 w-4" /></Button>}
        </div>
      ),
    },
  ];

  const hasFilters = !!(f.q || f.estado || f.desde || f.hasta);
  const d = detail.data;

  return (
    <div>
      <PageHeader title="Envíos" description="Pedidos y entregas a clientes." actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>Nuevo envío</Button>} />
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {[{ v: "", l: "Todos" }, ...SHIPMENT_STATES.map((s) => ({ v: s, l: SHIPMENT_STATE_LABELS[s] }))].map((t) => (
          <button key={t.v} onClick={() => upd({ estado: t.v })} className={`rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition ${f.estado === t.v ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}>
            {t.l}
          </button>
        ))}
      </div>
      <div className="card overflow-hidden">
        <FilterBar>
          <SearchBar value={f.q ?? ""} onChange={onSearch} placeholder="Cliente, empresa o N° de envío..." />
          <Select className="sm:w-44" value={f.estado} onChange={(e) => upd({ estado: e.target.value })} placeholder="Todos los estados" options={SHIPMENT_STATES.map((s) => ({ value: s, label: SHIPMENT_STATE_LABELS[s] }))} />
          <div className="flex items-center gap-2">
            <Input type="date" value={f.desde} onChange={(e) => upd({ desde: e.target.value })} aria-label="Desde" className="sm:w-40" />
            <span className="text-xs text-slate-400">a</span>
            <Input type="date" value={f.hasta} onChange={(e) => upd({ hasta: e.target.value })} aria-label="Hasta" className="sm:w-40" />
          </div>
          {hasFilters && <Button variant="ghost" size="sm" onClick={() => setF(initial)}>Limpiar</Button>}
        </FilterBar>
        <Table columns={columns} rows={data?.rows} loading={loading} error={error} onRetry={reload} rowKey={(s) => s.id} empty={<EmptyState title="Sin envíos" description={hasFilters ? "No hay envíos con estos filtros." : "Creá el primer envío para un cliente."} />} />
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(page) => upd({ page })} />}
      </div>

      <ShipmentFormModal open={formOpen} onClose={() => setFormOpen(false)} shipment={editing} onSaved={reload} />

      <Modal open={detailId !== null} onClose={() => setDetailId(null)} size="lg" title={detailId ? `Envío ${shipmentCode(detailId)}` : ""}>
        {detail.loading && !d ? (
          <Loading />
        ) : detail.error ? (
          <p className="text-sm text-red-600">{detail.error}</p>
        ) : d ? (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge estado={d.estado} />
              {d.stockDescontado ? <Badge tone="green">Stock descontado</Badge> : <Badge>Stock sin descontar</Badge>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><p className="text-xs text-slate-500">Cliente</p><p className="font-medium">{d.clienteNombre}</p><p className="text-slate-500">{d.clienteEmpresa}</p></div>
              <div><p className="text-xs text-slate-500">Contacto</p><p>{d.telefono}</p></div>
              <div><p className="text-xs text-slate-500">Dirección</p><p>{d.direccion}, {d.ciudad}</p></div>
              <div><p className="text-xs text-slate-500">Fechas</p><p>Creado: {formatDateTime(d.createdAt)}</p><p>Envío: {formatDate(d.fechaEnvio)}</p><p>Entrega: {formatDate(d.fechaEntrega)}</p></div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="table-base">
                <thead><tr><th>Producto</th><th className="text-right">Cant.</th><th className="text-right">P. unit.</th><th className="text-right">Subtotal</th></tr></thead>
                <tbody>
                  {d.items?.map((i) => (
                    <tr key={i.id}><td><p className="font-medium">{i.productoNombre}</p><p className="font-mono text-xs text-slate-500">{i.productoSku}</p></td><td className="text-right">{i.cantidad}</td><td className="text-right">{formatMoney(i.precioUnitario)}</td><td className="text-right font-medium">{formatMoney(i.subtotal)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end text-base">Total: <b className="ml-2">{formatMoney(d.total)}</b></div>
            {d.observaciones && <p className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60"><span className="text-xs text-slate-500">Observaciones: </span>{d.observaciones}</p>}
            {d.estado !== "entregado" && d.estado !== "cancelado" && (
              <div>
                <p className="mb-2 text-xs font-medium text-slate-500">Cambiar estado</p>
                <div className="flex flex-wrap gap-2">
                  {SHIPMENT_STATES.filter((s) => s !== d.estado).map((s) => (
                    <Button key={s} size="sm" variant={s === "cancelado" ? "danger" : s === "entregado" ? "success" : "secondary"} onClick={() => requestStatus(d, s)}>
                      {SHIPMENT_STATE_LABELS[s]}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={() => pending && applyStatus(pending.s, pending.estado)}
        loading={busy}
        danger={pending?.estado === "cancelado"}
        title={`Cambiar a “${pending ? SHIPMENT_STATE_LABELS[pending.estado] : ""}”`}
        confirmLabel="Confirmar"
        message={
          pending && (
            <div className="space-y-2">
              <p>¿Confirmás el cambio de estado del envío <b>{shipmentCode(pending.s.id)}</b>?</p>
              {STOCK_DEDUCTED_STATES.includes(pending.estado) && !pending.s.stockDescontado && <p className="text-amber-700 dark:text-amber-400">Se descontarán del inventario los productos del envío y se registrarán las salidas de stock.</p>}
              {(pending.estado === "cancelado" || pending.estado === "pendiente") && pending.s.stockDescontado && <p className="text-emerald-700 dark:text-emerald-400">Los productos se reingresarán al stock.</p>}
              {(pending.estado === "cancelado" || pending.estado === "entregado") && <p className="text-xs text-slate-500">Luego no podrá volver a cambiarse de estado.</p>}
            </div>
          )
        }
      />
    </div>
  );
}
