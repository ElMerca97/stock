export function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-UY", { style: "currency", currency: "UYU", maximumFractionDigits: 2 }).format(
    n || 0,
  );
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("es-UY").format(n || 0);
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shipmentCode(id: number): string {
  return `ENV-${String(id).padStart(5, "0")}`;
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function stockLevel(stock: number, min: number): "agotado" | "bajo" | "ok" {
  if (stock <= 0) return "agotado";
  if (stock <= min) return "bajo";
  return "ok";
}
