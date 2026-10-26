/* eslint-disable @next/next/no-img-element */
export function Avatar({ user, size = 36 }: { user: { nombre: string; apellido?: string; avatar: string | null }; size?: number }) {
  const initials = `${user.nombre?.[0] ?? ""}${user.apellido?.[0] ?? ""}`.toUpperCase();
  if (user.avatar)
    return <img src={user.avatar} alt={user.nombre} style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover" />;
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700 dark:bg-brand-900/50 dark:text-brand-300"
    >
      {initials || "?"}
    </span>
  );
}
