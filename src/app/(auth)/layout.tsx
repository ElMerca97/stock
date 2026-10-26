import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Boxes, CheckCircle2 } from "lucide-react";
import { getSessionUser } from "@/services/auth/session";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-indigo-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-indigo-400/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur"><Boxes className="h-6 w-6" /></span>
          <span className="text-xl font-bold">StockPro</span>
        </div>
        <div className="relative space-y-6">
          <h2 className="text-4xl leading-tight font-bold">El control de tu inventario, en un solo panel.</h2>
          <ul className="space-y-3 text-brand-100">
            {["Stock en tiempo real con historial de movimientos", "Alertas automáticas de stock bajo y agotado", "Gestión de envíos con descuento automático de inventario", "Roles y permisos para tu equipo"].map((t) => (
              <li key={t} className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-300" /> {t}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-brand-200">Sistema de gestión para distribuidoras</p>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white"><Boxes className="h-5 w-5" /></span>
            <span className="text-lg font-bold">StockPro</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
