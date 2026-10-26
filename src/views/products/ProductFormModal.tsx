"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, Toggle } from "@/components/ui/Input";
import { ImageUpload, type ImageValue } from "@/components/ui/ImageUpload";
import { createProduct, updateProduct } from "@/services/products/actions";
import { uploadImageIfNeeded } from "@/services/storage/client";
import { PRODUCT_TYPES, type CategoryDTO, type ProductDTO } from "@/types";

const empty = { nombre: "", sku: "", categoriaId: "", tipo: "Unidad", descripcion: "", precioCompra: "", precioVenta: "", stockMinimo: "5", stockInicial: "0", activo: true };

export function ProductFormModal({ open, onClose, product, categories, onSaved }: { open: boolean; onClose: () => void; product: ProductDTO | null; categories: CategoryDTO[]; onSaved: () => void }) {
  const [f, setF] = useState(empty);
  const [img, setImg] = useState<ImageValue>({ url: null, file: null });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setErrors({});
    if (product) {
      setF({
        nombre: product.nombre,
        sku: product.sku,
        categoriaId: String(product.categoriaId ?? ""),
        tipo: product.tipo,
        descripcion: product.descripcion,
        precioCompra: String(product.precioCompra),
        precioVenta: String(product.precioVenta),
        stockMinimo: String(product.stockMinimo),
        stockInicial: "0",
        activo: product.activo,
      });
      setImg({ url: product.imagen, file: null });
    } else {
      setF(empty);
      setImg({ url: null, file: null });
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, product]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  function validate() {
    const e: Record<string, string> = {};
    if (!f.nombre.trim()) e.nombre = "Requerido";
    if (!f.sku.trim()) e.sku = "Requerido";
    if (!f.categoriaId) e.categoriaId = "Seleccioná una categoría";
    if (f.precioCompra === "" || Number(f.precioCompra) < 0) e.precioCompra = "Importe inválido";
    if (f.precioVenta === "" || Number(f.precioVenta) < 0) e.precioVenta = "Importe inválido";
    if (!Number.isInteger(Number(f.stockMinimo)) || Number(f.stockMinimo) < 0) e.stockMinimo = "Entero ≥ 0";
    if (!product && (!Number.isInteger(Number(f.stockInicial)) || Number(f.stockInicial) < 0)) e.stockInicial = "Entero ≥ 0";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const imagen = await uploadImageIfNeeded(img, "products");
      const input = {
        nombre: f.nombre,
        sku: f.sku,
        categoriaId: Number(f.categoriaId),
        tipo: f.tipo,
        descripcion: f.descripcion,
        precioCompra: Number(f.precioCompra),
        precioVenta: Number(f.precioVenta),
        stockMinimo: Number(f.stockMinimo),
        imagen,
        activo: f.activo,
        stockInicial: Number(f.stockInicial),
      };
      const r = product ? await updateProduct(product.id, input) : await createProduct(input);
      if (!r.ok) return toast.error(r.error);
      toast.success(product ? "Producto actualizado" : "Producto creado");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  }

  const margin = Number(f.precioVenta) > 0 && Number(f.precioCompra) > 0 ? ((Number(f.precioVenta) - Number(f.precioCompra)) / Number(f.precioCompra)) * 100 : null;
  const catOptions = categories.filter((c) => c.activo || String(c.id) === f.categoriaId).map((c) => ({ value: c.id, label: c.nombre }));
  const typeOptions = Array.from(new Set([...PRODUCT_TYPES, f.tipo])).map((t) => ({ value: t, label: t }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? "Editar producto" : "Nuevo producto"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button type="submit" form="product-form" loading={loading}>{product ? "Guardar cambios" : "Crear producto"}</Button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><ImageUpload value={img} onChange={setImg} label="Imagen del producto" /></div>
        <div className="sm:col-span-2"><Input label="Nombre" required value={f.nombre} onChange={set("nombre")} error={errors.nombre} /></div>
        <Input label="SKU / Código" required value={f.sku} onChange={set("sku")} error={errors.sku} placeholder="BEB-010" />
        <Select label="Categoría" required value={f.categoriaId} onChange={set("categoriaId")} options={catOptions} placeholder="Seleccionar..." error={errors.categoriaId} />
        <Select label="Tipo" required value={f.tipo} onChange={set("tipo")} options={typeOptions} />
        <Input label="Stock mínimo" type="number" min={0} required value={f.stockMinimo} onChange={set("stockMinimo")} error={errors.stockMinimo} hint="Se alertará al llegar a este valor" />
        <Input label="Precio de compra" type="number" min={0} step="0.01" required value={f.precioCompra} onChange={set("precioCompra")} error={errors.precioCompra} />
        <Input label="Precio de venta" type="number" min={0} step="0.01" required value={f.precioVenta} onChange={set("precioVenta")} error={errors.precioVenta} hint={margin !== null ? `Margen: ${margin.toFixed(1)}%` : undefined} />
        {product ? (
          <div className="rounded-lg bg-slate-50 p-3 text-sm sm:col-span-2 dark:bg-slate-800/60">
            Stock actual: <b>{product.stock}</b>. Para modificarlo usá <b>“Movimiento”</b> — cada cambio queda registrado en el historial.
          </div>
        ) : (
          <Input label="Stock inicial" type="number" min={0} value={f.stockInicial} onChange={set("stockInicial")} error={errors.stockInicial} hint="Se registra como movimiento de entrada" />
        )}
        <div className="sm:col-span-2"><Textarea label="Descripción" value={f.descripcion} onChange={set("descripcion")} /></div>
        <div className="sm:col-span-2"><Toggle checked={f.activo} onChange={(v) => setF({ ...f, activo: v })} label="Producto activo" /></div>
      </form>
    </Modal>
  );
}
