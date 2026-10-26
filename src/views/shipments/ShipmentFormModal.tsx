"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { listCustomers } from "@/services/customers/actions";
import { listProductOptions } from "@/services/products/actions";
import { createShipment, updateShipment } from "@/services/shipments/actions";
import type { CustomerDTO, ShipmentDTO } from "@/types";
import { formatMoney } from "@/utils/format";

type Opt = { id: number; nombre: string; sku: string; stock: number; precioVenta: number; activo: boolean };
interface Line { productoId: string; cantidad: string }

export function ShipmentFormModal({ open, onClose, shipment, onSaved }: { open: boolean; onClose: () => void; shipment: ShipmentDTO | null; onSaved: () => void }) {
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [products, setProducts] = useState<Opt[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [fechaEnvio, setFechaEnvio] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [lines, setLines] = useState<Line[]>([{ productoId: "", cantidad: "1" }]);
  // Precios históricos del envío en edición (productoId -> precioUnitario original).
  const [histPrices, setHistPrices] = useState<Map<number, number>>(new Map());
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    void listCustomers({ pageSize: 500 }).then((r) => r.ok && setCustomers(r.data.rows));
    void listProductOptions().then((r) => r.ok && setProducts(r.data));
    /* eslint-disable react-hooks/set-state-in-effect */
    setErr(null);
    setClienteId(shipment ? String(shipment.clienteId) : "");
    setTelefono(shipment?.telefono ?? "");
    setDireccion(shipment?.direccion ?? "");
    setCiudad(shipment?.ciudad ?? "");
    setFechaEnvio(shipment?.fechaEnvio ? shipment.fechaEnvio.slice(0, 10) : "");
    setObservaciones(shipment?.observaciones ?? "");
    setLines(shipment?.items?.length ? shipment.items.map((i) => ({ productoId: String(i.productoId), cantidad: String(i.cantidad) })) : [{ productoId: "", cantidad: "1" }]);
    setHistPrices(new Map(shipment?.items?.map((i) => [i.productoId, i.precioUnitario]) ?? []));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, shipment]);

  function pickCustomer(id: string) {
    setClienteId(id);
    const c = customers.find((x) => String(x.id) === id);
    if (c) {
      setTelefono(c.telefono);
      setDireccion(c.direccion);
      setCiudad(c.ciudad);
    }
  }

  /** Precio unitario efectivo: histórico si la línea ya existía; actual si es nueva. */
  const unitPrice = useCallback(
    (productoId: string): number => {
      const idNum = Number(productoId);
      const hist = histPrices.get(idNum);
      if (hist !== undefined) return hist;
      return products.find((p) => String(p.id) === productoId)?.precioVenta ?? 0;
    },
    [histPrices, products],
  );

  const total = useMemo(() => lines.reduce((acc, l) => acc + unitPrice(l.productoId) * (Number(l.cantidad) || 0), 0), [lines, unitPrice]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (loading) return; // evita envíos duplicados mientras está en curso
    if (!clienteId) return setErr("Seleccioná un cliente.");
    if (!telefono.trim() || !direccion.trim() || !ciudad.trim()) return setErr("Teléfono, dirección y ciudad son obligatorios.");
    const items = lines.filter((l) => l.productoId).map((l) => ({ productoId: Number(l.productoId), cantidad: Number(l.cantidad) }));
    if (!items.length) return setErr("Agregá al menos un producto.");
    if (items.some((i) => !Number.isInteger(i.cantidad) || i.cantidad < 1)) return setErr("Las cantidades deben ser enteros mayores a 0.");
    setLoading(true);
    setErr(null);
    const input = { clienteId: Number(clienteId), telefono, direccion, ciudad, observaciones, fechaEnvio: fechaEnvio || null, items };
    try {
      const r = shipment ? await updateShipment(shipment.id, input) : await createShipment(input);
      if (!r.ok) {
        setErr(r.error);
        return; // el formulario conserva sus datos para corregir
      }
      toast.success(shipment ? "Envío actualizado" : "Envío creado");
      onSaved();
      onClose();
    } catch {
      setErr("No se pudo conectar con el servidor. Revisá tu conexión e intentá nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  // Seleccionables: productos activos + los inactivos que ya forman parte del envío
  // (no desaparecen las líneas existentes; se muestran marcados como "(inactivo)").
  const lineIds = new Set(lines.map((l) => l.productoId));
  const productOptions = products
    .filter((p) => p.activo || lineIds.has(String(p.id)))
    .map((p) => ({
      value: p.id,
      label: `${p.nombre} — ${formatMoney(p.precioVenta)} (stock ${p.stock})${p.activo ? "" : " · inactivo"}`,
    }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={shipment ? "Editar envío" : "Nuevo envío"}
      description="El stock se descuenta automáticamente cuando el envío pasa a “Preparando”."
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="ship-form" loading={loading}>{shipment ? "Guardar" : "Crear envío"}</Button></>}
    >
      <form id="ship-form" onSubmit={submit} className="space-y-4">
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">{err}</div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Select label="Cliente" required value={clienteId} onChange={(e) => pickCustomer(e.target.value)} placeholder="Seleccionar cliente..." options={customers.map((c) => ({ value: c.id, label: `${c.nombre} ${c.apellido}${c.empresa ? ` — ${c.empresa}` : ""}` }))} />
          </div>
          <Input label="Teléfono" required value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          <Input label="Ciudad / localidad" required value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
          <div className="sm:col-span-2"><Input label="Dirección de entrega" required value={direccion} onChange={(e) => setDireccion(e.target.value)} /></div>
          <Input label="Fecha de envío (prevista)" type="date" value={fechaEnvio} onChange={(e) => setFechaEnvio(e.target.value)} />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Productos</span>
            <Button type="button" size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setLines([...lines, { productoId: "", cantidad: "1" }])}>Agregar</Button>
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => {
              const p = products.find((x) => String(x.id) === l.productoId);
              const over = p && Number(l.cantidad) > p.stock;
              const inactiveLine = p && !p.activo;
              return (
                <div key={i} className="flex flex-wrap items-start gap-2 rounded-lg border border-slate-200 p-2 sm:flex-nowrap dark:border-slate-800">
                  <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <Select value={l.productoId} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, productoId: e.target.value } : x)))} placeholder="Producto..." options={productOptions} />
                    {over && <p className="mt-1 text-xs text-amber-600">⚠️ Supera el stock disponible ({p.stock}). No podrá confirmarse hasta reponer.</p>}
                    {inactiveLine && <p className="mt-1 text-xs text-amber-600">⚠️ Este producto está inactivo. Podés conservar la línea, pero no agregarlo a envíos nuevos ni editarlo fuera de este envío.</p>}
                  </div>
                  <Input type="number" min={1} value={l.cantidad} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))} className="w-24" aria-label="Cantidad" />
                  <span className="w-28 pt-2 text-right text-sm font-medium">{formatMoney(unitPrice(l.productoId) * (Number(l.cantidad) || 0))}</span>
                  <Button type="button" size="icon" variant="ghost" onClick={() => setLines(lines.length > 1 ? lines.filter((_, j) => j !== i) : [{ productoId: "", cantidad: "1" }])} aria-label="Quitar"><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex justify-end text-base">Total: <b className="ml-2">{formatMoney(total)}</b></div>
        </div>
        <Textarea label="Observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
      </form>
    </Modal>
  );
}
