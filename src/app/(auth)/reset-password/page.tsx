import { Suspense } from "react";
import { ResetForm } from "@/views/auth/AuthForms";

export const metadata = { title: "Nueva contraseña — Ferretería Lausana" };

export default function Page() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
