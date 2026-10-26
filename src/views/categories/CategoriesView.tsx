/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus, Power, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAsync } from "@/hooks/useAsync";
import { createCategory, deleteCategory, listCategories, toggleCategory, updateCategory } from "@/services/categories/actions";
import { uploadImageIfNeeded } from "@/services/storage/client";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Toggle } from "@/components/ui/Input";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { ImageUpload, type ImageValue } from "@/components/ui/ImageUpload";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/Feedback";
import { ActiveBadge } from "@/components/ui/Badges";
import type { CategoryDTO } from "@/types";
import { formatDate } from "@/utils/format";

function CategoryForm({ open, onClose, cat, onSaved }: { open: boolean; onClose: () => void; cat: CategoryDTO | null; onSaved: () => void }) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [activo, setActivo] = useState(true);
  const [img, setImg] = useState<ImageValue>({ url: null, file: null });
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setNombre(cat?.nombre ?? "");
    setDescripcion(cat?.descripcion ?? "");
    setActivo(cat?.activo ?? true);
    setImg({ url: cat?.imagen ?? null, file: null });
    setErr(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, cat]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return setErr("El nombre es obligatorio.");
    setLoading(true);
    try {
      const imagen = await uploadImageIfNeeded(img, "categories");
      const input = { nombre, descripcion, imagen, activo };
      const r = cat ? await updateCategory(cat.id, input) : await createCategory(input);
      if (!r.ok) return setErr(r.error);
      toast.success(cat ? "Categoría actualizada" : "Categoría creada");
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={cat ? "Editar categoría" : "Nueva categoría"} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="cat-form" loading={loading}>Guardar</Button></>}>
      <form id="cat-form" onSubmit={submit} className="space-y-4">
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">{err}</div>}
        <ImageUpload value={img} onChange={setImg} label="Imagen (opcional)" />
        <Input label="Nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Bebidas" />
        <Textarea label="Descripción" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        <Toggle checked={activo} onChange={setActivo} label="Categoría activa" />
      </form>
    </Modal>
  );
}

export function CategoriesView() {
  const { data, loading, error, reload } = useAsync(() => listCategories(), []);
  const [editing, setEditing] = useState<CategoryDTO | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<CategoryDTO | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggle(c: CategoryDTO) {
    const r = await toggleCategory(c.id, !c.activo);
    if (!r.ok) return toast.error(r.error);
    toast.success(c.activo ? "Categoría desactivada" : "Categoría activada");
    void reload();
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    const r = await deleteCategory(deleting.id);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Categoría eliminada");
    setDeleting(null);
    void reload();
  }

  const newBtn = <Button icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setOpen(true); }}>Nueva categoría</Button>;

  return (
    <div>
      <PageHeader title="Categorías" description="Organizá el catálogo en categorías dinámicas." actions={newBtn} />
      {error ? (
        <div className="card"><ErrorState message={error} onRetry={reload} /></div>
      ) : loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 w-full" />)}</div>
      ) : !data?.length ? (
        <div className="card"><EmptyState title="Sin categorías" description="Creá la primera categoría para organizar tus productos." action={newBtn} icon={<Tags className="h-6 w-6" />} /></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((c) => (
            <div key={c.id} className={`card flex gap-4 p-4 ${c.activo ? "" : "opacity-70"}`}>
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-50 dark:bg-brand-900/30">
                {c.imagen ? <img src={c.imagen} alt="" className="h-full w-full object-cover" /> : <Tags className="h-7 w-7 text-brand-500" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate font-semibold">{c.nombre}</h3>
                  <ActiveBadge activo={c.activo} />
                </div>
                <p className="line-clamp-2 text-sm text-slate-500">{c.descripcion || "Sin descripción"}</p>
                <div className="mt-2 flex items-center justify-between">
                  <Link href={`/products?categoria=${c.id}`} className="text-xs font-medium text-brand-600 hover:underline">{c.productCount} producto{c.productCount === 1 ? "" : "s"}</Link>
                  <span className="text-[11px] text-slate-400">Creada {formatDate(c.createdAt)}</span>
                </div>
                <div className="mt-2 flex gap-1">
                  <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => { setEditing(c); setOpen(true); }}>Editar</Button>
                  <Button size="sm" variant="ghost" icon={<Power className="h-3.5 w-3.5" />} onClick={() => toggle(c)}>{c.activo ? "Desactivar" : "Activar"}</Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5 text-red-500" />} onClick={() => setDeleting(c)} disabled={c.productCount > 0} title={c.productCount > 0 ? "Tiene productos asociados" : "Eliminar"} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <CategoryForm open={open} onClose={() => setOpen(false)} cat={editing} onSaved={reload} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove} loading={busy} title="Eliminar categoría" confirmLabel="Eliminar" message={<>¿Eliminar la categoría <b>{deleting?.nombre}</b>? Esta acción no se puede deshacer.</>} />
    </div>
  );
}
