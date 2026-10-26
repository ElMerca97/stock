import { Suspense } from "react";
import { ProductsView } from "@/views/products/ProductsView";
import { Loading } from "@/components/ui/Feedback";

export const metadata = { title: "Productos — StockPro" };

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <ProductsView />
    </Suspense>
  );
}
