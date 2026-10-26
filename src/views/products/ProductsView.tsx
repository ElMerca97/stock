"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { ArrowLeftRight, LayoutGrid, List, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/contexts/AuthContext";
import { useAlerts } from "@/components/layout/AppShell";
import { deleteProduct, listProducts, listProductTypes, setProductActive, type ProductFilters } from "@/services/products/actions";
import { listCategories } from "@/services/categories/actions";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/Feedback";
import { FilterBar, Pagination, SearchBar, Table, type Column } from "@/components/ui/Table";
import { ActiveBadge, StockBadge } from "@/components/ui/Badges";
import { ProductCard, ProductThumb } from "@/components/products/ProductCard";
import { MovementModal } from "@/components/stock/MovementModal";
import { ProductFormModal } from "./ProductFormModal";
import type { ProductDTO } from "@/types";
import { formatMoney } from "@/utils/format";

export function ProductsView() {
  const params = useSearchParams();
  const { isAdmin, canMove } = useAuth();
  const { refreshAlerts } = useAlerts();
  const [view, setView] = useState<"table" | "grid">("table");
  const [f, setF] = useState<ProductFilters>({
    q: "",
    categoriaId: params.get("categoria") ? Number(params.get("categoria")) : null,
    tipo: "",
    estado: "",
    stock: (params.get("stock") as ProductFilters["stock"]) ?? "",
    page: 1,
    pageSize: 12,
  });
  const upd = useCallback((patch: Partial<ProductFilters>) => setF((p) => ({ ...p, ...patch, page: patch.page ?? 1 })), []);
  const onSearch = useCallback((q: string) => upd({ q }), [upd]);

  const { data, loading, error, reload } = useAsync(() => listProducts(f), [JSON.stringify(f)]);
  const cats = useAsync(() => listCategories(), []);
  const types = useAsync(() => listProductTypes(), []);

  const [editing, setEditing] = useState<ProductDTO | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [moving, setMoving] = useState<ProductDTO | null>(null);
  const [deleting, setDeleting] = useState<ProductDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const afterChange = () => {
    void reload();
    void refreshAlerts();
  };

  async function toggle(p: ProductDTO) {
    const r = await setProductActive(p.id, !p.activo);
    if (!r.ok) return toast.error(r.error);
    toast.success(p.activo ? "Producto desactivado" : "Producto activado");
    afterChange();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    const r = await deleteProduct(deleting.id);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Producto eliminado");
    setDeleting(null);
    afterChange();
  }

  const actions = (p: ProductDTO) => (
    <div className="flex items-center gap-1">
      {canMove && (
        <Button size="sm" variant="secondary" icon={<ArrowLeftRight className="h-3.5 w-3.5" />} onClick={() => setMoving(p)} title="Registrar movimiento">
          <span className="hidden xl:inline">Movimiento</span>
        </Button>
      )}
      {isAdmin && (
        <>
          <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setFormOpen(true); }} title="Editar" aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={() => toggle(p)} title={p.activo ? "Desactivar" : "Activar"} aria-label="Activar/desactivar"><Power className={`h-4 w-4 ${p.activo ? "text-emerald-600" : ""}`} /></Button>
          <Button size="icon" variant="ghost" onClick={() => setDeleting(p)} title="Eliminar" aria-label="Eliminar"><Trash2 className="h-4 w-4 text-red-500" /></Button>
        </>
      )}
    </div>
  );

  const columns: Column<ProductDTO>[] = [
    {
      key: "p",
      header: "Producto",
      render: (p) => (
        <div className="flex min-w-[200px] items-center gap-3">
          <ProductThumb src={p.imagen} />
          <div>
            <p className="font-medium">{p.nombre}</p>
            <p className="font-mono text-xs text-slate-500">{p.sku}</p>
          </div>
        </div>
      ),
    },
    { key: "c", header: "Categoría", render: (p) => <span className="whitespace-nowrap">{p.categoriaNombre ?? "—"}</span> },
    { key: "t", header: "Tipo", render: (p) => p.tipo },
    ...(isAdmin ? [{ key: "pc", header: "Compra", render: (p: ProductDTO) => <span className="whitespace-nowrap">{formatMoney(p.precioCompra)}</span>, className: "text-right" }] : []),
    { key: "pv", header: "Venta", render: (p) => <span className="font-medium whitespace-nowrap">{formatMoney(p.precioVenta)}</span>, className: "text-right" },
    {
      key: "s",
      header: "Stock",
      render: (p) => (
        <div className="flex flex-col items-start gap-1">
          <span className="font-semibold">{p.stock} <span className="text-xs font-normal text-slate-500">/ mín. {p.stockMinimo}</span></span>
          <StockBadge stock={p.stock} min={p.stockMinimo} />
        </div>
      ),
    },
    { key: "e", header: "Estado", render: (p) => <ActiveBadge activo={p.activo} /> },
    { key: "a", header: "", render: actions, className: "text-right" },
  ];

  const hasFilters = !!(f.q || f.categoriaId || f.tipo || f.estado || f.stock);

  return (
    <div>
      <PageHeader
        title="Productos"
        description="Catálogo, precios y stock de la distribuidora."
        actions={
          <>
            {canMove && <Button variant="secondary" icon={<ArrowLeftRight className="h-4 w-4" />} onClick={() => setMoving({ id: 0 } as ProductDTO)}>Movimiento</Button>}
            {isAdmin && <Button icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>Nuevo producto</Button>}
          </>
        }
      />
      <div className="card overflow-hidden">
        <FilterBar>
          <SearchBar value={f.q ?? ""} onChange={onSearch} placeholder="Buscar por nombre o SKU..." />
          <Select className="sm:w-44" value={f.categoriaId ?? ""} onChange={(e) => upd({ categoriaId: e.target.value ? Number(e.target.value) : null })} placeholder="Todas las categorías" options={(cats.data ?? []).map((c) => ({ value: c.id, label: c.nombre }))} />
          <Select className="sm:w-36" value={f.tipo} onChange={(e) => upd({ tipo: e.target.value })} placeholder="Todos los tipos" options={(types.data ?? []).map((t) => ({ value: t, label: t }))} />
          <Select className="sm:w-36" value={f.estado} onChange={(e) => upd({ estado: e.target.value as ProductFilters["estado"] })} placeholder="Activos e inactivos" options={[{ value: "activo", label: "Activos" }, { value: "inactivo", label: "Inactivos" }]} />
          <Select className="sm:w-40" value={f.stock} onChange={(e) => upd({ stock: e.target.value as ProductFilters["stock"] })} placeholder="Cualquier stock" options={[{ value: "bajo", label: "Stock bajo" }, { value: "agotado", label: "Sin stock" }, { value: "ok", label: "Stock normal" }]} />
          {hasFilters && <Button variant="ghost" size="sm" onClick={() => setF({ q: "", categoriaId: null, tipo: "", estado: "", stock: "", page: 1, pageSize: 12 })}>Limpiar</Button>}
          <div className="flex gap-1 sm:ml-auto">
            <Button size="icon" variant={view === "table" ? "secondary" : "ghost"} onClick={() => setView("table")} aria-label="Vista tabla"><List className="h-4 w-4" /></Button>
            <Button size="icon" variant={view === "grid" ? "secondary" : "ghost"} onClick={() => setView("grid")} aria-label="Vista tarjetas"><LayoutGrid className="h-4 w-4" /></Button>
          </div>
        </FilterBar>

        {view === "table" ? (
          <Table
            columns={columns}
            rows={data?.rows}
            loading={loading}
            error={error}
            onRetry={reload}
            rowKey={(p) => p.id}
            empty={
              <EmptyState
                title={hasFilters ? "No se encontraron productos" : "Todavía no hay productos"}
                description={hasFilters ? "Probá con otros filtros." : "Creá tu primer producto para empezar a controlar el stock."}
                action={isAdmin && !hasFilters ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>Nuevo producto</Button> : undefined}
              />
            }
          />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <div className="grid grid-cols-2 gap-3 p-3 md:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-64 w-full" />)}</div>
        ) : data?.rows.length === 0 ? (
          <EmptyState title="No se encontraron productos" />
        ) : (
          <div className="grid grid-cols-1 gap-3 p-3 min-[440px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {data?.rows.map((p) => <ProductCard key={p.id} p={p} showCost={isAdmin} actions={actions(p)} />)}
          </div>
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(page) => upd({ page })} />}
      </div>

      <ProductFormModal open={formOpen} onClose={() => setFormOpen(false)} product={editing} categories={cats.data ?? []} onSaved={afterChange} />
      <MovementModal open={!!moving} onClose={() => setMoving(null)} product={moving && moving.id ? moving : null} onDone={afterChange} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={busy}
        title="Eliminar producto"
        confirmLabel="Eliminar"
        message={<>¿Seguro que querés eliminar <b>{deleting?.nombre}</b>? El producto dejará de estar disponible, pero su historial de movimientos y envíos se conservará.</>}
      />
    </div>
  );
}
