import { SHIPMENT_STATE_LABELS, type MovementType, type ShipmentState } from "@/types";
import { cn, stockLevel } from "@/utils/format";

type Tone = "gray" | "green" | "red" | "amber" | "blue" | "indigo" | "violet";
const tones: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900",
  red: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900",
  amber: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900",
  blue: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-900",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:ring-indigo-900",
  violet: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:ring-violet-900",
};

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", tones[tone], className)}>
      {children}
    </span>
  );
}

const shipmentTone: Record<ShipmentState, Tone> = {
  pendiente: "amber",
  preparando: "blue",
  listo: "indigo",
  enviado: "violet",
  entregado: "green",
  cancelado: "red",
};

export function StatusBadge({ estado }: { estado: ShipmentState }) {
  return <Badge tone={shipmentTone[estado]}>{SHIPMENT_STATE_LABELS[estado]}</Badge>;
}

export function ActiveBadge({ activo }: { activo: boolean }) {
  return <Badge tone={activo ? "green" : "gray"}>{activo ? "Activo" : "Inactivo"}</Badge>;
}

export function StockBadge({ stock, min }: { stock: number; min: number }) {
  const lvl = stockLevel(stock, min);
  if (lvl === "agotado") return <Badge tone="red">● Sin stock</Badge>;
  if (lvl === "bajo") return <Badge tone="amber">● Stock bajo</Badge>;
  return <Badge tone="green">● Disponible</Badge>;
}

export function MovementBadge({ tipo }: { tipo: MovementType }) {
  const map: Record<MovementType, [Tone, string]> = { entrada: ["green", "Entrada"], salida: ["red", "Salida"], ajuste: ["blue", "Ajuste"] };
  const [t, l] = map[tipo];
  return <Badge tone={t}>{l}</Badge>;
}
