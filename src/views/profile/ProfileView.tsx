"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { changePasswordAction, updateProfileAction } from "@/services/auth/actions";
import { uploadImageIfNeeded } from "@/services/storage/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ImageUpload, type ImageValue } from "@/components/ui/ImageUpload";
import { PageHeader } from "@/components/ui/Feedback";
import { Badge } from "@/components/ui/Badges";

export function ProfileView() {
  const { user, isAdmin, canMove } = useAuth();
  const router = useRouter();
  const [nombre, setNombre] = useState(user.nombre);
  const [apellido, setApellido] = useState(user.apellido);
  const [img, setImg] = useState<ImageValue>({ url: user.avatar, file: null });
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ actual: "", nueva: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwErr, setPwErr] = useState<string | null>(null);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return toast.error("El nombre es obligatorio.");
    setSaving(true);
    try {
      const avatar = await uploadImageIfNeeded(img, "avatars");
      const r = await updateProfileAction({ nombre, apellido, avatar });
      if (!r.ok) return toast.error(r.error);
      toast.success("Perfil actualizado");
      setImg({ url: avatar, file: null });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function savePw(e: FormEvent) {
    e.preventDefault();
    if (pw.nueva.length < 6) return setPwErr("La nueva contraseña debe tener al menos 6 caracteres.");
    if (pw.nueva !== pw.confirm) return setPwErr("Las contraseñas no coinciden.");
    setPwSaving(true);
    setPwErr(null);
    const r = await changePasswordAction({ actual: pw.actual, nueva: pw.nueva });
    setPwSaving(false);
    if (!r.ok) return setPwErr(r.error);
    toast.success("Contraseña actualizada");
    setPw({ actual: "", nueva: "", confirm: "" });
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Mi perfil" description="Tus datos personales y seguridad." />
      <div className="space-y-4">
        <form onSubmit={saveProfile} className="card space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">Datos personales</h2>
            <Badge tone={isAdmin ? "indigo" : "gray"}>{isAdmin ? "Administrador" : "Empleado"}</Badge>
            {!isAdmin && <Badge tone={canMove ? "green" : "amber"}>{canMove ? "Puede registrar movimientos" : "Sin permiso de movimientos"}</Badge>}
          </div>
          <ImageUpload value={img} onChange={setImg} label="Avatar" rounded />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
            <Input label="Apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} />
            <div className="sm:col-span-2"><Input label="Email" value={user.email} disabled hint="El email no puede modificarse." /></div>
          </div>
          <div className="flex justify-end"><Button type="submit" loading={saving}>Guardar cambios</Button></div>
        </form>
        <form onSubmit={savePw} className="card space-y-4 p-5">
          <h2 className="font-semibold">Cambiar contraseña</h2>
          {pwErr && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">{pwErr}</div>}
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Actual" type="password" required value={pw.actual} onChange={(e) => setPw({ ...pw, actual: e.target.value })} />
            <Input label="Nueva" type="password" required value={pw.nueva} onChange={(e) => setPw({ ...pw, nueva: e.target.value })} />
            <Input label="Confirmar" type="password" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </div>
          <div className="flex justify-end"><Button type="submit" variant="secondary" loading={pwSaving}>Actualizar contraseña</Button></div>
        </form>
      </div>
    </div>
  );
}
