"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useCallback, useState, useEffect } from "react";
import { toast } from "sonner";
import { useAsync } from "@/hooks/useAsync";
import { listProductOptions } from "@/services/products/actions";
import { createShipment } from "@/services/shipments/actions";
import { SHIPMENT_STATES } from "@/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Input";
import { EmptyState, Loading, PageHeader } from "@/components/ui/Feedback";
import { FilterBar, Pagination, SearchBar, Table } from "@/components/ui/Table";
import { formatMoney } from "@/utils/format";
import { useAuth } from "@/contexts/AuthContext";

export function SalesPage() {
  const params = useSearchParams();
  const [f, setF] = useState<{ q: string; estado: string }>({
    q: params.get("q") ?? "",
    estado: "",
  });

  const { user } = useAuth();
  const clienteId = user?.id != null ? Number(user.id) : 1;

  const onSearch = useCallback((q: string) => setF({ q, estado: f.estado }), [f]);
  const onFilterEstado = useCallback((e: string) => setF({ ...f, estado: e }), [f]);

  const [products, setProducts] = useState<{ id: number; nombre: string; sku: string; stock: number; precioVenta: number; activo: boolean }[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<{ id: number; nombre: string; sku: string; stock: number; precioVenta: number } | null>(null);
  const [cantidad, setCantidad] = useState<string>("1");

  const { data, loading, error, reload } = useAsync(() => listProductOptions(), []);

  useEffect(() => {
    if (data && data.length) setProducts(data as any);
  }, [data]);

  const handleCreate = useCallback(async () => {
    if (!selectedProduct || !cantidad.trim()) {
      toast.error("Selecciona un producto y cantidad");
      return;
    }
    const qty = Number(cantidad);
    if (qty <= 0 || qty > selectedProduct.stock) {
      toast.error(`Cantidad debe ser >= 1 y <= ${selectedProduct.stock}`);
      return;
    }
    const r = await createShipment({
      clienteId,
      telefono: "",
      cantidad: qty,
    });
    if (!r.ok) return toast.error(r.error);
    toast.success("Venta creada con estado 'pendiente'");
    setSelectedProduct(null);
    setCantidad("1");
    reload();
  }, [selectedProduct, cantidad, createShipment, reload]);

  if (loading || !products.length) {
    return (
      <Suspense fallback={<Loading />}>
        <PageHeader title="Venta" description="Nueva venta de productos" />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<Loading />}>
      <PageHeader title="Venta" description="Registra una nueva venta de productos" />
      <div className="mt-4">
        <SearchBar
          placeholder="Buscar producto por nombre, SKU..."
          value={f.q}
          onChange={onSearch}
        />
        <Select
  options={products.map((p) => ({ value: String(p.id), label: p.nombre }))}
  placeholder="Producto"
  value={selectedProduct?.nombre ?? ""}
  onValueChange={(v) => setSelectedProduct(products.find((p) => p.nombre === v) ?? null)}
>
</Select>
      </div>
    </Suspense>
  );
}