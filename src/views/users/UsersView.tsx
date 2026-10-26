"use client";

import { useState, type FormEvent } from "react";
import { Plus, ShieldCheck, UserCog } from "lucide-react";
import { toast } from "sonner";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/contexts/AuthContext";
import { createUser, listUsers, updateUserAccess } from "@/services/users/actions";
import { Button } from "@/components/ui/Button";
import { Input, Select, Toggle } from "@/components/ui/Input";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { EmptyState, PageHeader } from "@/components/ui/Feedback";
import { Table, type Column } from "@/components/ui/Table";
import { ActiveBadge, Badge } from "@/components/ui/Badges";
import { Avatar } from "@/components/layout/Avatar";
import type { Role, UserDTO } from "@/types";
import { formatDate } from "@/utils/format";

export function UsersView() {
  const { user: me } = useAuth();
  const { data, loading, error, reload } = useAsync(() => listUsers(), []);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ nombre: "", apellido: "", email: "", password: "", rol: "empleado" as Role, puedeMovimientos: true });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ u: UserDTO; patch: Partial<UserDTO>; msg: string } | null>(null);

  async function save(u: UserDTO, patch: Partial<UserDTO>) {
    const r = await updateUserAccess(u.id, { rol: patch.rol ?? u.rol, puedeMovimientos: patch.puedeMovimientos ?? u.puedeMovimientos, activo: patch.activo ?? u.activo });
    setConfirm(null);
    if (!r.ok) return toast.error(r.error);
    toast.success("Permisos actualizados");
    void reload();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return; // evita creaciones duplicadas
    if (!f.nombre.trim() || !f.email.trim()) return setErr("Nombre y email son obligatorios.");
    if (f.password.length < 6) return setErr("La contraseña debe tener al menos 6 caracteres.");
    setSaving(true);
    setErr(null);
    try {
      const r = await createUser(f);
      if (!r.ok) {
        setErr(r.error);
        return; // conserva los datos ingresados
      }
      toast.success("Usuario creado");
      setOpen(false);
      void reload();
    } catch {
      setErr("No se pudo conectar con el servidor. Intentá nuevamente.");
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<UserDTO>[] = [
    { key: "u", header: "Usuario", render: (u) => <div className="flex min-w-[200px] items-center gap-3"><Avatar user={u} /><div><p className="font-medium">{u.nombre} {u.apellido} {u.id === me.id && <Badge tone="blue">Vos</Badge>}</p><p className="text-xs text-slate-500">{u.email}</p></div></div> },
    {
      key: "r",
      header: "Rol",
      render: (u) => (
        <select value={u.rol} disabled={u.id === me.id} onChange={(e) => setConfirm({ u, patch: { rol: e.target.value as Role }, msg: `¿Cambiar el rol de ${u.nombre} a ${e.target.value === "admin" ? "Administrador" : "Empleado"}?` })} className="input-base h-8 w-auto py-0 text-xs">
          <option value="admin">Administrador</option>
          <option value="empleado">Empleado</option>
        </select>
      ),
    },
    { key: "p", header: "Registrar movimientos", render: (u) => u.rol === "admin" ? <Badge tone="indigo"><ShieldCheck className="h-3 w-3" /> Total</Badge> : <Toggle checked={u.puedeMovimientos} onChange={(v) => save(u, { puedeMovimientos: v })} /> },
    { key: "e", header: "Estado", render: (u) => <div className="flex items-center gap-2"><Toggle checked={u.activo} disabled={u.id === me.id} onChange={(v) => setConfirm({ u, patch: { activo: v }, msg: v ? `¿Reactivar a ${u.nombre}?` : `¿Desactivar a ${u.nombre}? Se cerrarán sus sesiones y no podrá ingresar.` })} /><ActiveBadge activo={u.activo} /></div> },
    { key: "f", header: "Alta", render: (u) => formatDate(u.createdAt) },
  ];

  return (
    <div>
      <PageHeader title="Usuarios y permisos" description="Gestioná el acceso de tu equipo." actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => { setErr(null); setF({ nombre: "", apellido: "", email: "", password: "", rol: "empleado", puedeMovimientos: true }); setOpen(true); }}>Nuevo usuario</Button>} />
      <div className="card overflow-hidden">
        <Table columns={columns} rows={data} loading={loading} error={error} onRetry={reload} rowKey={(u) => u.id} empty={<EmptyState title="Sin usuarios" icon={<UserCog className="h-6 w-6" />} />} />
      </div>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div className="card p-4"><p className="font-semibold">Administrador</p><p className="mt-1 text-slate-500">Acceso total: productos, precios, categorías, usuarios, estadísticas, ajustes de stock y envíos.</p></div>
        <div className="card p-4"><p className="font-semibold">Empleado</p><p className="mt-1 text-slate-500">Consulta productos y stock, gestiona clientes y envíos, ve alertas y — si tiene permiso — registra entradas/salidas.</p></div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo usuario" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" form="user-form" loading={saving}>Crear</Button></>}>
        <form id="user-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2 dark:bg-red-950/50 dark:text-red-300">{err}</div>}
          <Input label="Nombre" required value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          <Input label="Apellido" value={f.apellido} onChange={(e) => setF({ ...f, apellido: e.target.value })} />
          <Input label="Email" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <Input label="Contraseña inicial" type="password" required minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          <Select label="Rol" value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value as Role })} options={[{ value: "empleado", label: "Empleado" }, { value: "admin", label: "Administrador" }]} />
          {f.rol === "empleado" && <div className="flex items-end pb-2"><Toggle checked={f.puedeMovimientos} onChange={(v) => setF({ ...f, puedeMovimientos: v })} label="Puede registrar movimientos" /></div>}
        </form>
      </Modal>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm && save(confirm.u, confirm.patch)} title="Confirmar cambio" message={confirm?.msg} danger={confirm?.patch.activo === false} />
    </div>
  );
}
