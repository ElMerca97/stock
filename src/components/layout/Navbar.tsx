"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, LogOut, Menu, Moon, Sun, User } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { logoutAction } from "@/services/auth/actions";
import { markAlertsSeen } from "@/services/alerts/actions";
import type { AlertDTO } from "@/types";
import { Avatar } from "./Avatar";

export function Navbar({ onMenu, alerts, onAlertsChanged }: { onMenu: () => void; alerts: AlertDTO[]; onAlertsChanged: () => void }) {
  const { user, isAdmin } = useAuth();
  const { theme, toggle } = useTheme();
  const router = useRouter();
  const [openBell, setOpenBell] = useState(false);
  const [openUser, setOpenUser] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const unseen = alerts.filter((a) => !a.visto);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) {
        setOpenBell(false);
        setOpenUser(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  async function logout() {
    await logoutAction();
    router.replace("/login");
    router.refresh();
  }

  async function markSeen() {
    const r = await markAlertsSeen();
    if (r.ok) onAlertsChanged();
    else toast.error(r.error);
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 sm:px-6">
      <button onClick={onMenu} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden" aria-label="Abrir menú">
        <Menu className="h-5 w-5" />
      </button>
      <div className="flex-1" />
      <div ref={wrap} className="flex items-center gap-1">
        <button onClick={toggle} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Cambiar tema" title="Modo claro/oscuro">
          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <div className="relative">
          <button onClick={() => { setOpenBell((v) => !v); setOpenUser(false); }} className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Notificaciones">
            <Bell className="h-5 w-5" />
            {unseen.length > 0 && (
              <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unseen.length}</span>
            )}
          </button>
          {openBell && (
            <div className="card animate-fade-in absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <span className="text-sm font-semibold">Notificaciones de stock</span>
                {unseen.length > 0 && (
                  <button onClick={markSeen} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                    <CheckCheck className="h-3.5 w-3.5" /> Marcar vistas
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {alerts.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-slate-500">Sin alertas de inventario 🎉</p>
                ) : (
                  alerts.slice(0, 12).map((a) => (
                    <Link
                      key={a.productoId}
                      href="/alerts"
                      onClick={() => setOpenBell(false)}
                      className={`block border-b border-slate-100 px-4 py-2.5 text-sm last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${a.visto ? "opacity-60" : ""}`}
                    >
                      <span className="font-medium">{a.tipo === "agotado" ? "🔴 Sin stock" : "⚠️ Stock bajo"}</span>
                      {!a.visto && <span className="ml-2 rounded bg-brand-600 px-1 text-[10px] text-white">NUEVA</span>}
                      <span className="block text-xs text-slate-500">
                        {a.nombre} ({a.categoriaNombre ?? "Sin categoría"}) — {a.tipo === "agotado" ? "agotado" : `${a.stock} u. (mín. ${a.stockMinimo})`}
                      </span>
                    </Link>
                  ))
                )}
              </div>
              <Link href="/alerts" onClick={() => setOpenBell(false)} className="block border-t border-slate-200 px-4 py-2.5 text-center text-xs font-medium text-brand-600 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                Ver todas las alertas
              </Link>
            </div>
          )}
        </div>
        <div className="relative">
          <button onClick={() => { setOpenUser((v) => !v); setOpenBell(false); }} className="ml-1 flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-slate-100 dark:hover:bg-slate-800">
            <Avatar user={user} size={32} />
            <span className="hidden text-left sm:block">
              <span className="block text-sm leading-tight font-medium">{user.nombre}</span>
              <span className="block text-[11px] leading-tight text-slate-500">{isAdmin ? "Administrador" : "Empleado"}</span>
            </span>
          </button>
          {openUser && (
            <div className="card animate-fade-in absolute right-0 mt-2 w-56 overflow-hidden py-1">
              <div className="border-b border-slate-200 px-4 py-2 dark:border-slate-800">
                <p className="truncate text-sm font-medium">{user.nombre} {user.apellido}</p>
                <p className="truncate text-xs text-slate-500">{user.email}</p>
              </div>
              <Link href="/profile" onClick={() => setOpenUser(false)} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                <User className="h-4 w-4" /> Mi perfil
              </Link>
              <button onClick={logout} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-slate-50 dark:hover:bg-slate-800">
                <LogOut className="h-4 w-4" /> Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
