"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Lock, Mail, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { loginAction, registerAction, requestPasswordResetAction, resetPasswordAction } from "@/services/auth/actions";

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500">{subtitle}</p>
      {children}
    </div>
  );
}

function ErrorBox({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">{msg}</div>;
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const r = await loginAction({ email, password });
    setLoading(false);
    if (!r.ok) return setError(r.error);
    toast.success("¡Bienvenido!");
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <Shell title="Iniciar sesión" subtitle="Accedé al panel de gestión de tu distribuidora.">
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox msg={error} />
        <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} icon={<Mail className="h-4 w-4" />} placeholder="tu@empresa.com" />
        <Input label="Contraseña" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} icon={<Lock className="h-4 w-4" />} placeholder="••••••" />
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm text-brand-600 hover:underline">¿Olvidaste tu contraseña?</Link>
        </div>
        <Button type="submit" className="w-full" loading={loading}>Ingresar</Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        ¿No tenés cuenta? <Link href="/register" className="font-medium text-brand-600 hover:underline">Registrate</Link>
      </p>
    </Shell>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [f, setF] = useState({ nombre: "", apellido: "", email: "", password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (f.password.length < 6) return setError("La contraseña debe tener al menos 6 caracteres.");
    if (f.password !== f.confirm) return setError("Las contraseñas no coinciden.");
    setLoading(true);
    setError(null);
    const r = await registerAction(f);
    setLoading(false);
    if (!r.ok) return setError(r.error);
    toast.success("Cuenta creada correctamente");
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <Shell title="Crear cuenta" subtitle="Las cuentas nuevas se crean con rol Empleado. Un administrador puede ampliar tus permisos.">
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox msg={error} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Nombre" required value={f.nombre} onChange={set("nombre")} icon={<User className="h-4 w-4" />} />
          <Input label="Apellido" value={f.apellido} onChange={set("apellido")} />
        </div>
        <Input label="Email" type="email" required value={f.email} onChange={set("email")} icon={<Mail className="h-4 w-4" />} />
        <Input label="Contraseña" type="password" required minLength={6} value={f.password} onChange={set("password")} hint="Mínimo 6 caracteres" />
        <Input label="Confirmar contraseña" type="password" required value={f.confirm} onChange={set("confirm")} />
        <Button type="submit" className="w-full" loading={loading}>Crear cuenta</Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        ¿Ya tenés cuenta? <Link href="/login" className="font-medium text-brand-600 hover:underline">Iniciá sesión</Link>
      </p>
    </Shell>
  );
}

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ link: string | null } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const r = await requestPasswordResetAction({ email });
    setLoading(false);
    if (!r.ok) return setError(r.error);
    setDone(r.data);
  }

  return (
    <Shell title="Recuperar contraseña" subtitle="Ingresá tu email y generaremos un enlace para restablecerla.">
      {done ? (
        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            Si el email está registrado, se generó un enlace de recuperación válido por 1 hora.
          </div>
          {done.link && (
            <div className="rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">
              <p className="mb-2 text-xs text-slate-500">No hay un proveedor de email configurado; usá este enlace directamente:</p>
              <Link href={done.link} className="font-medium break-all text-brand-600 hover:underline">Restablecer contraseña →</Link>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <ErrorBox msg={error} />
          <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} icon={<Mail className="h-4 w-4" />} />
          <Button type="submit" className="w-full" loading={loading}>Generar enlace</Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm"><Link href="/login" className="text-brand-600 hover:underline">← Volver al login</Link></p>
    </Shell>
  );
}

export function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 6) return setError("La contraseña debe tener al menos 6 caracteres.");
    if (password !== confirm) return setError("Las contraseñas no coinciden.");
    setLoading(true);
    setError(null);
    const r = await resetPasswordAction({ token, password });
    setLoading(false);
    if (!r.ok) return setError(r.error);
    toast.success("Contraseña actualizada. Iniciá sesión.");
    router.replace("/login");
  }

  return (
    <Shell title="Nueva contraseña" subtitle="Elegí una nueva contraseña para tu cuenta.">
      {!token ? (
        <ErrorBox msg="Enlace inválido. Solicitá uno nuevo desde 'Recuperar contraseña'." />
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <ErrorBox msg={error} />
          <Input label="Nueva contraseña" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          <Input label="Confirmar contraseña" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <Button type="submit" className="w-full" loading={loading}>Guardar contraseña</Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm"><Link href="/login" className="text-brand-600 hover:underline">← Volver al login</Link></p>
    </Shell>
  );
}
