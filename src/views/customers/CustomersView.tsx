"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { History, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/contexts/AuthContext";
import { createCustomer, deleteCustomer, listCustomers, updateCustomer, type CustomerInput } from "@/services/customers/actions";
import { listShipments } from "@/services/shipments/actions";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { EmptyState, Loading, PageHeader } from "@/components/ui/Feedback";
import { FilterBar, Pagination, SearchBar, Table, type Column } from "@/components/ui/Table";
import { StatusBadge } from "@/components/ui/Badges";
import type { CustomerDTO } from "@/types";
import { formatDate, formatMoney, shipmentCode } from "@/utils/format";

const empty: CustomerInput = { nombre: "", apellido: "", empresa: "", telefono: "", email: "", direccion: "", ciudad: "", departamento: "", observaciones: "" };

function CustomerForm({ open, onClose, customer, onSaved }: { open: boolean; onClose: () => void; customer: CustomerDTO | null; onSaved: () => void }) {
  const [f, setF] = useState<CustomerInput>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setErrors({});
    setF(customer ? { nombre: customer.nombre, apellido: customer.apellido, empresa: customer.empresa, telefono: customer.telefono, email: customer.email, direccion: customer.direccion, ciudad: customer.ciudad, departamento: customer.departamento, observaciones: customer.observaciones } : empty);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, customer]);
  const set = (k: keyof CustomerInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (loading) return; // evita envíos duplicados
    const er: Record<string, string> = {};
    if (!f.nombre.trim()) er.nombre = "Requerido";
    if (!f.telefono.trim()) er.telefono = "Requerido";
    if (!f.direccion.trim()) er.direccion = "Requerido";
    if (!f.ciudad.trim()) er.ciudad = "Requerido";
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) er.email = "Email inválido";
    setErrors(er);
    if (Object.keys(er).length) return;
    setLoading(true);
    try {
      const r = customer ? await updateCustomer(customer.id, f) : await createCustomer(f);
      if (!r.ok) {
        toast.error(r.error);
        return; // conserva los datos del formulario
      }
      toast.success(customer ? "Cliente actualizado" : "Cliente creado");
      onSaved();
      onClose();
    } catch {
      toast.error("No se pudo conectar con el servidor. Intentá nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title={customer ? "Editar cliente" : "Nuevo cliente"} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="cust-form" loading={loading}>Guardar</Button></>}>
      <form id="cust-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
        <Input label="Nombre" required value={f.nombre} onChange={set("nombre")} error={errors.nombre} />
        <Input label="Apellido" value={f.apellido} onChange={set("apellido")} />
        <Input label="Empresa" value={f.empresa} onChange={set("empresa")} />
        <Input label="Teléfono" required value={f.telefono} onChange={set("telefono")} error={errors.telefono} />
        <Input label="Email" type="email" value={f.email} onChange={set("email")} error={errors.email} />
        <Input label="Dirección" required value={f.direccion} onChange={set("direccion")} error={errors.direccion} />
        <Input label="Ciudad" required value={f.ciudad} onChange={set("ciudad")} error={errors.ciudad} />
        <Input label="Departamento" value={f.departamento} onChange={set("departamento")} />
        <div className="sm:col-span-2"><Textarea label="Observaciones" value={f.observaciones} onChange={set("observaciones")} /></div>
      </form>
    </Modal>
  );
}

function HistoryModal({ customer, onClose }: { customer: CustomerDTO | null; onClose: () => void }) {
  const { data, loading, error } = useAsync(
    () => (customer ? listShipments({ clienteId: customer.id, pageSize: 100 }) : Promise.resolve({ ok: true as const, data: { rows: [], total: 0, page: 1, pageSize: 100 } })),
    [customer?.id],
  );
  const total = (data?.rows ?? []).filter((s) => s.estado !== "cancelado").reduce((a, s) => a + s.total, 0);
  return (
    <Modal open={!!customer} onClose={onClose} size="lg" title={`Historial de ${customer?.nombre ?? ""} ${customer?.apellido ?? ""}`} description={customer?.empresa}>
      {loading ? <Loading /> : error ? <p className="text-sm text-red-600">{error}</p> : !data?.rows.length ? (
        <EmptyState title="Sin pedidos" description="Este cliente todavía no tiene envíos." />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60"><p className="text-xs text-slate-500">Envíos</p><p className="text-lg font-bold">{data.total}</p></div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60"><p className="text-xs text-slate-500">Total facturado</p><p className="text-lg font-bold">{formatMoney(total)}</p></div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="table-base">
              <thead><tr><th>N°</th><th>Fecha</th><th>Unid.</th><th className="text-right">Total</th><th>Estado</th></tr></thead>
              <tbody>{data.rows.map((s) => <tr key={s.id}><td className="font-mono text-xs">{shipmentCode(s.id)}</td><td>{formatDate(s.createdAt)}</td><td>{s.itemCount}</td><td className="text-right">{formatMoney(s.total)}</td><td><StatusBadge estado={s.estado} /></td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function CustomersView() {
  const { isAdmin } = useAuth();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const onSearch = useCallback((v: string) => { setQ(v); setPage(1); }, []);
  const { data, loading, error, reload } = useAsync(() => listCustomers({ q, page }), [q, page]);
  const [editing, setEditing] = useState<CustomerDTO | null>(null);
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<CustomerDTO | null>(null);
  const [deleting, setDeleting] = useState<CustomerDTO | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    const r = await deleteCustomer(deleting.id);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Cliente eliminado");
    setDeleting(null);
    void reload();
  }

  const columns: Column<CustomerDTO>[] = [
    { key: "n", header: "Cliente", render: (c) => <div className="min-w-[150px]"><p className="font-medium">{c.nombre} {c.apellido}</p><p className="text-xs text-slate-500">{c.empresa || "—"}</p></div> },
    { key: "c", header: "Contacto", render: (c) => <div className="text-xs"><p>{c.telefono}</p><p className="text-slate-500">{c.email}</p></div> },
    { key: "d", header: "Dirección", render: (c) => <div className="min-w-[150px] text-xs"><p>{c.direccion}</p><p className="text-slate-500">{c.ciudad}{c.departamento ? `, ${c.departamento}` : ""}</p></div> },
    { key: "e", header: "Envíos", className: "text-right", render: (c) => c.shipmentCount },
    { key: "f", header: "Registro", render: (c) => <span className="whitespace-nowrap">{formatDate(c.createdAt)}</span> },
    {
      key: "a",
      header: "",
      className: "text-right",
      render: (c) => (
        <div className="flex justify-end gap-1">
          <Button size="icon" variant="ghost" onClick={() => setHistory(c)} title="Historial" aria-label="Historial"><History className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }} title="Editar" aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
          {isAdmin && <Button size="icon" variant="ghost" onClick={() => setDeleting(c)} title="Eliminar" aria-label="Eliminar"><Trash2 className="h-4 w-4 text-red-500" /></Button>}
        </div>
      ),
    },
  ];

  const newBtn = <Button icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setOpen(true); }}>Nuevo cliente</Button>;

  return (
    <div>
      <PageHeader title="Clientes" description="Cartera de clientes y su historial de pedidos." actions={newBtn} />
      <div className="card overflow-hidden">
        <FilterBar><SearchBar value={q} onChange={onSearch} placeholder="Nombre, empresa, teléfono o email..." /></FilterBar>
        <Table columns={columns} rows={data?.rows} loading={loading} error={error} onRetry={reload} rowKey={(c) => c.id} empty={<EmptyState title={q ? "Sin resultados" : "Sin clientes"} description={q ? "Probá con otra búsqueda." : "Registrá tu primer cliente."} icon={<Users className="h-6 w-6" />} action={q ? undefined : newBtn} />} />
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </div>
      <CustomerForm open={open} onClose={() => setOpen(false)} customer={editing} onSaved={reload} />
      <HistoryModal customer={history} onClose={() => setHistory(null)} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove} loading={busy} title="Eliminar cliente" confirmLabel="Eliminar" message={<>¿Eliminar a <b>{deleting?.nombre} {deleting?.apellido}</b>? Su historial de envíos se conserva.</>} />
    </div>
  );
}
