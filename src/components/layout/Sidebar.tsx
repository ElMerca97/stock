"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Bell,
  Boxes,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Tags,
  Truck,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/utils/format";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/products", label: "Productos", icon: Package },
  { href: "/categories", label: "Categorías", icon: Tags, admin: true },
  { href: "/stock", label: "Movimientos", icon: ArrowLeftRight },
  { href: "/alerts", label: "Alertas", icon: Bell },
  { href: "/sales", label: "Ventas", icon: ShoppingCart },
  { href: "/customers", label: "Clientes", icon: Users },
  { href: "/users", label: "Usuarios", icon: UserCog, admin: true },
];

export function Sidebar({ open, onClose, alertCount }: { open: boolean; onClose: () => void; alertCount: number }) {
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden" onClick={onClose} />}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform dark:border-slate-800 dark:bg-slate-900 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link href="/dashboard" className="flex items-center gap-2.5" onClick={onClose}>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
              <Boxes className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm leading-tight font-bold">StockPro</span>
              <span className="block text-[11px] leading-tight text-slate-500">Distribuidora</span>
            </span>
          </Link>
          <button onClick={onClose} className="rounded p-1 text-slate-400 lg:hidden" aria-label="Cerrar menú">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {NAV.filter((n) => !n.admin || isAdmin).map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + "/");
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                  active
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
                )}
              >
                <Icon className="h-4.5 w-4.5" />
                <span className="flex-1">{n.label}</span>
                {n.href === "/alerts" && alertCount > 0 && (
                  <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] leading-none font-bold text-white">{alertCount}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 p-4 text-[11px] text-slate-400 dark:border-slate-800">© {new Date().getFullYear()} StockPro · v1.0</div>
      </aside>
    </>
  );
}