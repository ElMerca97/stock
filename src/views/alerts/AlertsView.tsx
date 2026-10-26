"use client";

import { useEffect, useState } from "react";
import { CheckCheck, PackagePlus, Pencil, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useAlerts } from "@/components/layout/AppShell";
import { markAlertsSeen } from "@/services/alerts/actions";
import { Button } from "@/components/ui/Button";
import { EmptyState, PageHeader } from "@/components/ui/Feedback";
import { Table, type Column } from "@/components/ui/Table";
import { Badge, StockBadge } from "@/components/ui/Badges";
import { ProductThumb } from "@/components/products/ProductCard";
import { MovementModal } from "@/components/stock/MovementModal";
import type { AlertDTO } from "@/types";

export function AlertsView() {
  const { canMove, isAdmin } = useAuth();
  const { alerts, refreshAlerts } = useAlerts();
  const [tab, setTab] = useState<"todos" | "agotado" | "bajo">("todos");
  const [restock, setRestock] = useState<AlertDTO | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void Promise.resolve(refreshAlerts()).then(() => setLoaded(true));
  }, [refreshAlerts]);

  const rows = alerts.filter((a) => tab === "todos" || a.tipo === tab);
  const unseen = alerts.filter((a) => !a.visto).length;

  async function markAll() {
    const r = await markAlertsSeen();
    if (!r.ok) return toast.error(r.error);
    toast.success("Alertas marcadas como vistas");
    void refreshAlerts();
  }

  const columns: Column<AlertDTO>[] = [
    {
      key: "p",
      header: "Producto",
      render: (a) => (
        <div className="flex min-w-[200px] items-center gap-3">
          <ProductThumb src={a.imagen} />
          <div>
            <p className="font-medium">{a.nombre} {!a.visto && <Badge tone="blue" className="ml-1">Nueva</Badge>}</p>
            <p className="font-mono text-xs text-slate-500">{a.sku}</p>
          </div>
        </div>
      ),
    },
    { key: "c", header: "Categoría", render: (a) => a.categoriaNombre ?? "—" },
    { key: "s", header: "Actual", className: "text-right", render: (a) => <span className={`text-base font-bold ${a.stock <= 0 ? "text-red-600" : "text-amber-600"}`}>{a.stock}</span> },
    { key: "m", header: "Mínimo", className: "text-right", render: (a) => a.stockMinimo },
    { key: "f", header: "Faltante", className: "text-right", render: (a) => Math.max(0, a.stockMinimo - a.stock) },
    { key: "e", header: "Estado", render: (a) => <StockBadge stock={a.stock} min={a.stockMinimo} /> },
    {
      key: "a",
      header: "",
      className: "text-right",
      render: (a) => (
        <div className="flex justify-end gap-1">
          {canMove && <Button size="sm" variant="success" icon={<PackagePlus className="h-3.5 w-3.5" />} onClick={() => setRestock(a)}>Reponer</Button>}
          {isAdmin && <Link href={`/products?stock=${a.tipo}`}><Button size="icon" variant="ghost" title="Ver en productos"><Pencil className="h-4 w-4" /></Button></Link>}
        </div>
      ),
    },
  ];

  const tabs: { k: typeof tab; l: string; n: number }[] = [
    { k: "todos", l: "Todas", n: alerts.length },
    { k: "agotado", l: "Agotados", n: alerts.filter((a) => a.tipo === "agotado").length },
    { k: "bajo", l: "Stock bajo", n: alerts.filter((a) => a.tipo === "bajo").length },
  ];

  return (
    <div>
      <PageHeader
        title="Alertas de inventario"
        description="Productos activos con stock igual o inferior al mínimo configurado."
        actions={unseen > 0 ? <Button variant="secondary" icon={<CheckCheck className="h-4 w-4" />} onClick={markAll}>Marcar {unseen} como vistas</Button> : undefined}
      />
      <div className="card overflow-hidden">
        <div className="flex gap-1 border-b border-slate-200 px-3 pt-2 dark:border-slate-800">
          {tabs.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${tab === t.k ? "border-brand-600 text-brand-700 dark:text-brand-300" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
              {t.l} <span className="ml-1 rounded-full bg-slate-100 px-1.5 text-xs dark:bg-slate-800">{t.n}</span>
            </button>
          ))}
        </div>
        <Table columns={columns} rows={loaded ? rows : undefined} loading={!loaded} rowKey={(a) => a.productoId} empty={<EmptyState title="¡Todo en orden!" description="No hay productos con stock bajo ni agotados." icon={<ShieldCheck className="h-6 w-6 text-emerald-500" />} />} />
      </div>
      <MovementModal open={!!restock} onClose={() => setRestock(null)} product={restock ? { id: restock.productoId, nombre: restock.nombre, stock: restock.stock } : null} defaultTipo="entrada" onDone={refreshAlerts} />
    </div>
  );
}
