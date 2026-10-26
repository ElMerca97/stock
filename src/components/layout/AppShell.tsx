"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { listAlerts } from "@/services/alerts/actions";
import type { AlertDTO, SessionUser } from "@/types";
import { Navbar } from "./Navbar";
import { Sidebar } from "./Sidebar";

const AlertsCtx = createContext<{ alerts: AlertDTO[]; refreshAlerts: () => void }>({ alerts: [], refreshAlerts: () => {} });
export const useAlerts = () => useContext(AlertsCtx);

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertDTO[]>([]);
  const pathname = usePathname();
  const params = useSearchParams();
  // Suscribirse a cambios de ruta sin setState directo en el efecto (cumple react-hooks/set-state-in-effect).
  const subscribedPath = useRef<string | null>(null);

  const refreshAlerts = useCallback(async () => {
    const r = await listAlerts();
    if (r.ok) queueMicrotask(() => setAlerts(r.data));
  }, []);

  useEffect(() => {
    if (subscribedPath.current === pathname) return;
    subscribedPath.current = pathname;
    const t = setTimeout(() => {
      void refreshAlerts();
    }, 0);
    return () => clearTimeout(t);
  }, [pathname, refreshAlerts]);

  useEffect(() => {
    if (params.get("denied")) toast.error("No tenés permisos para acceder a esa sección.");
  }, [params]);

  return (
    <AuthProvider user={user}>
      <AlertsCtx.Provider value={{ alerts, refreshAlerts }}>
        <Sidebar open={open} onClose={() => setOpen(false)} alertCount={alerts.filter((a) => !a.visto).length} />
        <div className="lg:pl-64">
          <Navbar onMenu={() => setOpen(true)} alerts={alerts} onAlertsChanged={refreshAlerts} />
          <main className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main>
        </div>
      </AlertsCtx.Provider>
    </AuthProvider>
  );
}
