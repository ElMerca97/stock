"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { registerMovement } from "@/services/stock/actions";
import { listProductOptions } from "@/services/products/actions";
import { useAuth } from "@/contexts/AuthContext";
import type { MovementType } from "@/types";
import { cn } from "@/utils/format";

interface ProductRef {
  id: number;
  nombre: string;
  stock: number;
}

/** Registers an entry/exit/adjustment. If `product` is null, a product selector is shown. */
export function MovementModal({
  open,
  onClose,
  product,
  defaultTipo = "entrada",
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  product: ProductRef | null;
  defaultTipo?: MovementType;
  onDone?: () => void;
}) {
  const { isAdmin } = useAuth();
  const [tipo, setTipo] = useState<MovementType>(defaultTipo);
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<ProductRef[]>([]);
  const [selId, setSelId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setTipo(defaultTipo);
    setCantidad("");
    setMotivo("");
    setError(null);
    setSelId("");
    /* eslint-enable react-hooks/set-state-in-effect */
    if (!product) void listProductOptions().then((r) => r.ok && setOptions(r.data.filter((p) => p.activo)));
  }, [open, product, defaultTipo]);

  const current = product ?? options.find((o) => String(o.id) === selId) ?? null;
  const q = Number(cantidad);
  const preview = current && cantidad !== "" && Number.isInteger(q) ? (tipo === "entrada" ? current.stock + q : tipo === "salida" ? current.stock - q : q) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (loading) return; // evita envíos duplicados
    if (!current) return setError("Seleccioná un producto.");
    if (!Number.isInteger(q) || q < 0 || (tipo !== "ajuste" && q === 0)) return setError("Ingresá una cantidad válida.");
    if (preview !== null && preview < 0) return setError("La salida supera el stock disponible.");
    if (!motivo.trim()) return setError("Indicá el motivo del movimiento.");
    setLoading(true);
    setError(null);
    try {
      const r = await registerMovement({ productoId: current.id, tipo, cantidad: q, motivo });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(`Movimiento registrado. Nuevo stock: ${r.data.stockNuevo}`);
      onDone?.();
      onClose();
    } catch {
      setError("No se pudo conectar con el servidor. Intentá nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  const types: { v: MovementType; l: string; c: string }[] = [
    { v: "entrada", l: "Entrada", c: "peer-checked:bg-emerald-600 peer-checked:text-white peer-checked:border-emerald-600" },
    { v: "salida", l: "Salida", c: "peer-checked:bg-red-600 peer-checked:text-white peer-checked:border-red-600" },
    ...(isAdmin ? [{ v: "ajuste" as MovementType, l: "Ajuste", c: "peer-checked:bg-sky-600 peer-checked:text-white peer-checked:border-sky-600" }] : []),
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar movimiento de stock"
      description={product ? product.nombre : undefined}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="mov-form" loading={loading}>Registrar</Button>
        </>
      }
    >
      <form id="mov-form" onSubmit={submit} className="space-y-4">
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">{error}</div>}
        {!product && (
          <Select label="Producto" required value={selId} onChange={(e) => setSelId(e.target.value)} placeholder="Seleccionar producto..." options={options.map((o) => ({ value: o.id, label: `${o.nombre} (stock: ${o.stock})` }))} />
        )}
        <div className={cn("grid gap-2", types.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
          {types.map((t) => (
            <label key={t.v} className="cursor-pointer">
              <input type="radio" name="tipo" className="peer sr-only" checked={tipo === t.v} onChange={() => setTipo(t.v)} />
              <span className={cn("block rounded-lg border border-slate-300 py-2 text-center text-sm font-medium dark:border-slate-700", t.c)}>{t.l}</span>
            </label>
          ))}
        </div>
        <Input
          label={tipo === "ajuste" ? "Nuevo stock (conteo físico)" : "Cantidad"}
          type="number"
          min={tipo === "ajuste" ? 0 : 1}
          step={1}
          required
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
        />
        {current && (
          <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
            <span>Stock actual: <b>{current.stock}</b></span>
            <span>
              Stock posterior: <b className={preview !== null && preview < 0 ? "text-red-600" : ""}>{preview ?? "—"}</b>
            </span>
          </div>
        )}
        <Textarea label="Motivo / observación" required value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: Reposición proveedor, venta mostrador, rotura..." />
      </form>
    </Modal>
  );
}
