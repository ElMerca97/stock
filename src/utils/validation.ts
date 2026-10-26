/** Minimal, dependency-free validators shared by server services. */

export class ValidationError extends Error {}

export function str(v: unknown, field: string, opts: { required?: boolean; max?: number; min?: number } = {}): string {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  if (opts.required && !s) throw new ValidationError(`El campo "${field}" es obligatorio.`);
  if (opts.min && s.length < opts.min) throw new ValidationError(`"${field}" debe tener al menos ${opts.min} caracteres.`);
  if (opts.max && s.length > opts.max) throw new ValidationError(`"${field}" no puede superar ${opts.max} caracteres.`);
  return s;
}

export function int(v: unknown, field: string, opts: { min?: number; max?: number } = {}): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw new ValidationError(`"${field}" debe ser un número entero.`);
  if (opts.min !== undefined && n < opts.min) throw new ValidationError(`"${field}" debe ser mayor o igual a ${opts.min}.`);
  if (opts.max !== undefined && n > opts.max) throw new ValidationError(`"${field}" debe ser menor o igual a ${opts.max}.`);
  return n;
}

export function money(v: unknown, field: string): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) throw new ValidationError(`"${field}" debe ser un importe válido (≥ 0).`);
  return Math.round(n * 100) / 100;
}

export function email(v: unknown, field = "Email", required = true): string {
  const s = str(v, field, { required, max: 200 }).toLowerCase();
  if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new ValidationError("El email no tiene un formato válido.");
  return s;
}

export function imageUrl(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  if (!s.startsWith("/api/storage/") && !/^https?:\/\//.test(s)) throw new ValidationError("URL de imagen inválida.");
  return s;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ValidationError) return e.message;
  if (e instanceof Error) {
    const msg = e.message || "";
    const cause = (e as { cause?: { code?: string; detail?: string } }).cause;
    const code = (e as { code?: string }).code ?? cause?.code;
    if (code === "23505" || msg.includes("duplicate key")) return "Ya existe un registro con ese valor único (nombre/SKU/email).";
    if (code === "23503") return "No se puede completar: el registro está relacionado con otros datos.";
    if (e.name === "AuthError" || e.name === "PermissionError" || e.name === "RateLimitError") return msg;
    if (code === "ECONNREFUSED" || msg.includes("ECONNREFUSED") || msg.includes("connect ECONNREFUSED"))
      return "No se pudo conectar a la base de datos (ECONNREFUSED). Verificá que DATABASE_URL apunte a tu Postgres de Supabase y que las credenciales sean correctas.";
    console.error(e);
    return "Ocurrió un error inesperado. Intentá nuevamente.";
  }
  return "Ocurrió un error inesperado.";
}
