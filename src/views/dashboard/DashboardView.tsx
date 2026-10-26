"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock,
  Layers,
  Package,
  PackageX,
  Tags,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAsync } from "@/hooks/useAsync";
import { getDashboard } from "@/services/dashboard/actions";
import { useAuth } from "@/contexts/AuthContext";
import { useAlerts } from "@/components/layout/AppShell";
import { ErrorState, PageHeader, Skeleton } from "@/components/ui/Feedback";
import { formatMoney, formatNumber } from "@/utils/format";
import { SHIPMENT_STATE_LABELS, type ShipmentState } from "@/types";

const PIE_COLORS: Record<string, string> = {
  pendiente: "#f59e0b",
  preparando: "#0ea5e9",
  listo: "#6366f1",
  enviado: "#8b5cf6",
  entregado: "#10b981",
  cancelado: "#ef4444",
};

function StatCard({ label, value, icon, tone, href, sub }: { label: string; value: string; icon: ReactNode; tone: string; href?: string; sub?: string }) {
  const inner = (
    <div className="card group flex h-full items-start justify-between gap-3 p-4 transition hover:shadow-md">
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </div>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>{icon}</span>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function ChartCard({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`card p-4 ${className}`}>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="h-64">{children}</div>
    </div>
  );
}

const tooltipStyle = { borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 };

export function DashboardView() {
  const { user, isAdmin } = useAuth();
  const { alerts } = useAlerts();
  const { data, loading, error, reload } = useAsync(() => getDashboard(), []);
  const low = alerts.filter((a) => a.tipo === "bajo");
  const out = alerts.filter((a) => a.tipo === "agotado");

  return (
    <div>
      <PageHeader title={`Hola, ${user.nombre} 👋`} description="Resumen general del inventario y la operación." />

      {(low.length > 0 || out.length > 0) && (
        <div className="mb-6 overflow-hidden rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 shrink-0 text-amber-600" />
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                Tenemos <b>{low.length}</b> producto{low.length === 1 ? "" : "s"} con stock bajo y <b>{out.length}</b> agotado{out.length === 1 ? "" : "s"}.
              </p>
            </div>
            <Link href="/alerts" className="inline-flex items-center gap-1 text-sm font-semibold text-amber-800 hover:underline dark:text-amber-300">
              Ver alertas <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-px border-t border-amber-200 bg-amber-200 sm:grid-cols-2 dark:border-amber-900/60 dark:bg-amber-900/40">
            {[...out, ...low].slice(0, 4).map((a) => (
              <Link key={a.productoId} href="/alerts" className="bg-amber-50 px-4 py-2.5 text-sm hover:bg-amber-100 dark:bg-slate-900 dark:hover:bg-slate-800">
                <span className="font-semibold">{a.tipo === "agotado" ? "🔴 Sin stock" : "⚠️ Stock bajo"}</span>
                <span className="block text-xs text-slate-600 dark:text-slate-400">
                  {a.tipo === "agotado"
                    ? `El producto "${a.nombre}", categoría "${a.categoriaNombre ?? "—"}", está agotado.`
                    : `El producto "${a.nombre}", categoría "${a.categoriaNombre ?? "—"}", tiene solamente ${a.stock} unidades disponibles.`}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {error ? (
        <div className="card"><ErrorState message={error} onRetry={reload} /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-4">
            {loading || !data ? (
              Array.from({ length: 8 }).map((_, i) => <div key={i} className="card p-4"><Skeleton className="mb-2 h-3 w-20" /><Skeleton className="h-7 w-16" /></div>)
            ) : (
              <>
                <StatCard label="Total de productos" value={formatNumber(data.stats.totalProductos)} icon={<Package className="h-5 w-5" />} tone="bg-brand-50 text-brand-600 dark:bg-brand-900/30" href="/products" />
                <StatCard label="Stock bajo" value={formatNumber(data.stats.stockBajo)} icon={<AlertTriangle className="h-5 w-5" />} tone="bg-amber-50 text-amber-600 dark:bg-amber-900/30" href="/products?stock=bajo" />
                <StatCard label="Sin stock" value={formatNumber(data.stats.sinStock)} icon={<PackageX className="h-5 w-5" />} tone="bg-red-50 text-red-600 dark:bg-red-900/30" href="/products?stock=agotado" />
                <StatCard label="Unidades totales" value={formatNumber(data.stats.unidades)} icon={<Boxes className="h-5 w-5" />} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30" sub={isAdmin ? `Valor: ${formatMoney(data.stats.valorInventario)}` : undefined} />
                <StatCard label="Categorías" value={formatNumber(data.stats.categorias)} icon={<Tags className="h-5 w-5" />} tone="bg-violet-50 text-violet-600 dark:bg-violet-900/30" href={isAdmin ? "/categories" : undefined} />
                <StatCard label="Envíos pendientes" value={formatNumber(data.stats.enviosPendientes)} icon={<Clock className="h-5 w-5" />} tone="bg-sky-50 text-sky-600 dark:bg-sky-900/30" href="/shipments" sub="Pendiente · Preparando · Listo" />
                <StatCard label="Envíos realizados" value={formatNumber(data.stats.enviosRealizados)} icon={<CheckCircle2 className="h-5 w-5" />} tone="bg-teal-50 text-teal-600 dark:bg-teal-900/30" href="/shipments?estado=entregado" sub="Enviados y entregados" />
                <StatCard label="Alertas activas" value={formatNumber(alerts.length)} icon={<Layers className="h-5 w-5" />} tone="bg-rose-50 text-rose-600 dark:bg-rose-900/30" href="/alerts" />
              </>
            )}
          </div>

          {isAdmin && data?.charts && (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <ChartCard title="Evolución del stock total (últimos 30 días)" className="lg:col-span-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.charts.evolucion}>
                    <defs>
                      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#337dfc" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#337dfc" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={45} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey="unidades" name="Unidades" stroke="#1d5ef1" strokeWidth={2} fill="url(#g1)" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Productos por categoría">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.charts.porCategoria}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                    <XAxis dataKey="nombre" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#94a3b8" width={30} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="productos" name="Productos" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Envíos por estado">
                {data.charts.enviosPorEstado.length === 0 ? (
                  <p className="pt-20 text-center text-sm text-slate-500">Sin envíos registrados</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.charts.enviosPorEstado.map((e) => ({ ...e, label: SHIPMENT_STATE_LABELS[e.estado as ShipmentState] ?? e.estado }))} dataKey="cantidad" nameKey="label" innerRadius={55} outerRadius={85} paddingAngle={2}>
                        {data.charts.enviosPorEstado.map((e) => <Cell key={e.estado} fill={PIE_COLORS[e.estado] ?? "#94a3b8"} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
              <ChartCard title="Stock actual (top 10)">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.charts.stockActual} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                    <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={110} stroke="#94a3b8" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="stock" name="Stock" fill="#10b981" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="minimo" name="Mínimo" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Productos con mayor salida (30 días)">
                {data.charts.masMovimiento.length === 0 ? (
                  <p className="pt-20 text-center text-sm text-slate-500">Sin salidas en los últimos 30 días</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.charts.masMovimiento} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                      <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={110} stroke="#94a3b8" />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="movido" name="Unidades vendidas" fill="#ef4444" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>
          )}
        </>
      )}
    </div>
  );
}
