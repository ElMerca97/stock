/* eslint-disable @next/next/no-img-element */
"use client";

import type { ReactNode } from "react";
import { Package } from "lucide-react";
import type { ProductDTO } from "@/types";
import { ActiveBadge, StockBadge } from "@/components/ui/Badges";
import { formatMoney } from "@/utils/format";

export function ProductThumb({ src, size = 40 }: { src: string | null; size?: number }) {
  return (
    <span style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <Package className="h-1/2 w-1/2 text-slate-400" />}
    </span>
  );
}

export function ProductCard({ p, actions, showCost }: { p: ProductDTO; actions?: ReactNode; showCost?: boolean }) {
  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="relative flex aspect-[4/3] items-center justify-center bg-slate-100 dark:bg-slate-800">
        {p.imagen ? <img src={p.imagen} alt={p.nombre} className="h-full w-full object-cover" /> : <Package className="h-12 w-12 text-slate-300 dark:text-slate-600" />}
        <div className="absolute top-2 left-2"><StockBadge stock={p.stock} min={p.stockMinimo} /></div>
        {!p.activo && <div className="absolute top-2 right-2"><ActiveBadge activo={false} /></div>}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">{p.categoriaNombre ?? "Sin categoría"} · {p.tipo}</p>
        <h3 className="mt-0.5 line-clamp-2 text-sm font-semibold">{p.nombre}</h3>
        <p className="font-mono text-xs text-slate-500">{p.sku}</p>
        <div className="mt-2 flex items-end justify-between">
          <div>
            <p className="text-base font-bold">{formatMoney(p.precioVenta)}</p>
            {showCost && <p className="text-[11px] text-slate-500">Costo {formatMoney(p.precioCompra)}</p>}
          </div>
          <div className="text-right">
            <p className="text-lg leading-none font-bold">{p.stock}</p>
            <p className="text-[11px] text-slate-500">mín. {p.stockMinimo}</p>
          </div>
        </div>
        {actions && <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">{actions}</div>}
      </div>
    </div>
  );
}
