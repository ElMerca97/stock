"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { EmptyState, ErrorState, Skeleton } from "./Feedback";
import { Button } from "./Button";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

/** Generic data table with loading, error and empty states. */
export function Table<T>({
  columns,
  rows,
  loading,
  error,
  onRetry,
  rowKey,
  empty,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  rowKey: (r: T) => string | number;
  empty?: ReactNode;
  onRowClick?: (r: T) => void;
}) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.className}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && !rows?.length
            ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key}>
                      <Skeleton className="h-4 w-full max-w-[140px]" />
                    </td>
                  ))}
                </tr>
              ))
            : rows?.map((r) => (
                <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={onRowClick ? "cursor-pointer" : ""}>
                  {columns.map((c) => (
                    <td key={c.key} className={c.className}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
      {!loading && rows && rows.length === 0 && (empty ?? <EmptyState title="Sin resultados" description="No hay datos para mostrar con los filtros actuales." />)}
      {loading && !!rows?.length && <div className="h-0.5 w-full animate-pulse bg-brand-500" />}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
      <span className="text-slate-500">
        {from}–{to} de {total}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="icon" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-2 text-slate-600 dark:text-slate-300">
          {page} / {pages}
        </span>
        <Button variant="secondary" size="icon" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Siguiente">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** Debounced search input. */
export function SearchBar({ value, onChange, placeholder = "Buscar...", delay = 300 }: { value: string; onChange: (v: string) => void; placeholder?: string; delay?: number }) {
  const [local, setLocal] = useState(value);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocal(value);
  }, [value]);
  useEffect(() => {
    if (local === value) return;
    const t = setTimeout(() => onChange(local), delay);
    return () => clearTimeout(t);
  }, [local, value, onChange, delay]);
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input value={local} onChange={(e) => setLocal(e.target.value)} placeholder={placeholder} className="input-base pr-8 pl-9" />
      {local && (
        <button onClick={() => { setLocal(""); onChange(""); }} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600" aria-label="Limpiar">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2 border-b border-slate-200 p-3 sm:flex-row sm:flex-wrap sm:items-center dark:border-slate-800">{children}</div>;
}
