import { Suspense } from "react";
import { ResetForm } from "@/views/auth/AuthForms";

export const metadata = { title: "Nueva contraseña — StockPro" };

export default function Page() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
