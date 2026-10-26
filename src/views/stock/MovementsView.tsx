"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/contexts/AuthContext";
import { useAlerts } from "@/components/layout/AppShell";
import { listMovements, listUserOptions, type MovementFilters } from "@/services/stock/actions";
import { listProductOptions } from "@/services/products/actions";
import { listCategories } from "@/services/categories/actions";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { EmptyState, PageHeader } from "@/components/ui/Feedback";
import { FilterBar, Pagination, Table, type Column } from "@/components/ui/Table";
import { MovementBadge } from "@/components/ui/Badges";
import { MovementModal } from "@/components/stock/MovementModal";
import type { MovementDTO } from "@/types";
import { formatDateTime, shipmentCode } from "@/utils/format";

const initial: MovementFilters = { productoId: null, categoriaId: null, tipo: "", usuarioId: "", desde: "", hasta: "", page: 1, pageSize: 20 };

export function MovementsView() {
  const { isAdmin, canMove } = useAuth();
  const { refreshAlerts } = useAlerts();
  const [f, setF] = useState<MovementFilters>(initial);
  const upd = (patch: Partial<MovementFilters>) => setF((p) => ({ ...p, ...patch, page: patch.page ?? 1 }));
  const { data, loading, error, reload } = useAsync(() => listMovements(f), [JSON.stringify(f)]);
  const prods = useAsync(() => listProductOptions(), []);
  const cats = useAsync(() => listCategories(), []);
  const users = useAsync(() => listUserOptions(), []);
  const [open, setOpen] = useState(false);

  const columns: Column<MovementDTO>[] = [
    { key: "f", header: "Fecha y hora", render: (m) => <span className="whitespace-nowrap">{formatDateTime(m.createdAt)}</span> },
    { key: "p", header: "Producto", render: (m) => <div className="min-w-[160px]"><p className="font-medium">{m.productoNombre}</p><p className="text-xs text-slate-500">{m.categoriaNombre ?? "—"}</p></div> },
    { key: "t", header: "Tipo", render: (m) => <MovementBadge tipo={m.tipo} /> },
    {
      key: "c",
      header: "Cantidad",
      className: "text-right",
      render: (m) => {
        const diff = m.stockNuevo - m.stockAnterior;
        return <span className={`font-semibold ${diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-600" : ""}`}>{diff > 0 ? "+" : diff < 0 ? "−" : ""}{m.cantidad}</span>;
      },
    },
    { key: "s", header: "Stock ant. → nuevo", render: (m) => <span className="whitespace-nowrap text-slate-600 dark:text-slate-300">{m.stockAnterior} → <b>{m.stockNuevo}</b></span> },
    { key: "u", header: "Usuario", render: (m) => <span className="whitespace-nowrap">{m.usuarioNombre ?? "—"}</span> },
    {
      key: "m",
      header: "Motivo",
      render: (m) => (
        <span className="text-slate-600 dark:text-slate-300">
          {m.motivo}
          {m.envioId && <Link href={`/shipments?q=${m.envioId}`} className="ml-1 text-xs text-brand-600 hover:underline">({shipmentCode(m.envioId)})</Link>}
        </span>
      ),
    },
  ];

  const hasFilters = JSON.stringify({ ...f, page: 1 }) !== JSON.stringify(initial);

  return (
    <div>
      <PageHeader
        title="Historial de movimientos"
        description={isAdmin ? "Todas las entradas, salidas y ajustes de stock." : "Movimientos de stock registrados por vos."}
        actions={canMove ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Registrar movimiento</Button> : undefined}
      />
      <div className="card overflow-hidden">
        <FilterBar>
          <Select className="sm:w-52" value={f.productoId ?? ""} onChange={(e) => upd({ productoId: e.target.value ? Number(e.target.value) : null })} placeholder="Todos los productos" options={(prods.data ?? []).map((p) => ({ value: p.id, label: p.nombre }))} />
          <Select className="sm:w-44" value={f.categoriaId ?? ""} onChange={(e) => upd({ categoriaId: e.target.value ? Number(e.target.value) : null })} placeholder="Todas las categorías" options={(cats.data ?? []).map((c) => ({ value: c.id, label: c.nombre }))} />
          <Select className="sm:w-36" value={f.tipo} onChange={(e) => upd({ tipo: e.target.value })} placeholder="Todos los tipos" options={[{ value: "entrada", label: "Entradas" }, { value: "salida", label: "Salidas" }, { value: "ajuste", label: "Ajustes" }]} />
          {isAdmin && <Select className="sm:w-44" value={f.usuarioId} onChange={(e) => upd({ usuarioId: e.target.value })} placeholder="Todos los usuarios" options={(users.data ?? []).map((u) => ({ value: u.id, label: u.nombre }))} />}
          <div className="flex items-center gap-2">
            <Input type="date" value={f.desde} onChange={(e) => upd({ desde: e.target.value })} aria-label="Desde" className="sm:w-40" />
            <span className="text-xs text-slate-400">a</span>
            <Input type="date" value={f.hasta} onChange={(e) => upd({ hasta: e.target.value })} aria-label="Hasta" className="sm:w-40" />
          </div>
          {hasFilters && <Button variant="ghost" size="sm" onClick={() => setF(initial)}>Limpiar</Button>}
        </FilterBar>
        <Table columns={columns} rows={data?.rows} loading={loading} error={error} onRetry={reload} rowKey={(m) => m.id} empty={<EmptyState title="Sin movimientos" description={hasFilters ? "No hay movimientos con estos filtros." : "Todavía no se registraron movimientos de stock."} />} />
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(page) => upd({ page })} />}
      </div>
      <MovementModal open={open} onClose={() => setOpen(false)} product={null} onDone={() => { void reload(); void refreshAlerts(); void prods.reload(); }} />
    </div>
  );
}
