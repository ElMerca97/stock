import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { requirePageUser } from "@/services/auth/session";

export const dynamic = "force-dynamic";

export default async function PrivateLayout({ children }: { children: ReactNode }) {
  const user = await requirePageUser();
  return (
    <Suspense>
      <AppShell user={user}>{children}</AppShell>
    </Suspense>
  );
}
