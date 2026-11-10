import { Suspense } from "react";
import { ShipmentsView } from "@/views/shipments/ShipmentsView";
import { Loading } from "@/components/ui/Feedback";

export const metadata = { title: "Envíos — Ferretería Lausana" };

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <ShipmentsView />
    </Suspense>
  );
}
