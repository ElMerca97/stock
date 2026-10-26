"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/Feedback";
import { Input, Select } from "@/components/ui/Input";
import { useAuth } from "@/contexts/AuthContext";
import { useAsync } from "@/hooks/useAsync";
import { listCustomers } from "@/services/customers/actions";
import { listProductOptions, type ProductOptionDTO } from "@/services/products/actions";
import { createSale, type SaleReceipt } from "@/services/shipments/actions";
import { formatDateTime, formatMoney, shipmentCode } from "@/utils/format";

interface CartLine {
  productoId: number;
  cantidad: number;
}

const MAX_LINE_QUANTITY = 100_000;
const MAX_TOTAL_CENTS = 99_999_999_999_999;
const EMPTY_PRODUCTS: ProductOptionDTO[] = [];

function formatCents(cents: number): string {
  return cents > MAX_TOTAL_CENTS ? "Importe excedido" : formatMoney(cents / 100);
}

export default function SalesPage() {
  const router = useRouter();
  const { canMove } = useAuth();
  const productsRequest = useAsync(() => listProductOptions(), []);
  const customersRequest = useAsync(() => listCustomers({ pageSize: 500 }), []);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [customerId, setCustomerId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SaleReceipt | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const submittingRef = useRef(false);

  const products = productsRequest.data ?? EMPTY_PRODUCTS;
  const customers = customersRequest.data?.rows ?? [];
  const visibleProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return products.filter((product) => {
      if (!product.activo) return false;
      return !query || `${product.nombre} ${product.sku}`.toLocaleLowerCase().includes(query);
    });
  }, [products, search]);
  const cartTotalCents = useMemo(() => {
    return cart.reduce((total, line) => {
      const product = products.find((item) => item.id === line.productoId);
      const unitCents = Math.round((product?.precioVenta ?? 0) * 100);
      if (unitCents > Math.floor(MAX_TOTAL_CENTS / line.cantidad)) return MAX_TOTAL_CENTS + 1;
      const subtotalCents = unitCents * line.cantidad;
      return total > MAX_TOTAL_CENTS - subtotalCents ? MAX_TOTAL_CENTS + 1 : total + subtotalCents;
    }, 0);
  }, [cart, products]);
  const cartQuantity = cart.reduce((total, line) => total + line.cantidad, 0);
  const selectedCustomer = customers.find((customer) => String(customer.id) === customerId);

  function addProduct(product: ProductOptionDTO) {
    const current = cart.find((line) => line.productoId === product.id)?.cantidad ?? 0;
    if (product.stock <= 0) {
      toast.error("Este producto no tiene stock disponible.");
      return;
    }
    if (current >= Math.min(product.stock, MAX_LINE_QUANTITY)) {
      toast.error(`No hay más unidades disponibles para ${product.nombre}.`);
      return;
    }
    setCart((currentCart) => {
      const existing = currentCart.find((line) => line.productoId === product.id);
      if (existing) {
        return currentCart.map((line) =>
          line.productoId === product.id ? { ...line, cantidad: line.cantidad + 1 } : line,
        );
      }
      return [...currentCart, { productoId: product.id, cantidad: 1 }];
    });
  }

  function updateQuantity(productId: number, quantity: number) {
    const product = products.find((item) => item.id === productId);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > product.stock || quantity > MAX_LINE_QUANTITY)
      return;
    setCart((currentCart) =>
      currentCart.map((line) => (line.productoId === productId ? { ...line, cantidad: quantity } : line)),
    );
  }

  function removeProduct(productId: number) {
    setCart((currentCart) => currentCart.filter((line) => line.productoId !== productId));
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && visibleProducts.length) {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, visibleProducts.length - 1));
    } else if (event.key === "ArrowUp" && visibleProducts.length) {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && visibleProducts.length) {
      event.preventDefault();
      const product = visibleProducts[activeIndex] ?? visibleProducts[0];
      if (product.stock > 0) addProduct(product);
    }
  }

  function openReview() {
    if (!cart.length) {
      setCheckoutError("Agregá al menos un producto para confirmar la venta.");
      return;
    }
    if (!canMove) {
      setCheckoutError("No tenés permiso para registrar movimientos de stock.");
      return;
    }
    setCheckoutError(null);
    setReviewOpen(true);
  }

  async function confirmSale() {
    if (submittingRef.current || !cart.length) return;
    submittingRef.current = true;
    setSubmitting(true);
    setCheckoutError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const result = await createSale({
        clienteId: customerId ? Number(customerId) : null,
        idempotencyKey: idempotencyKey.current,
        items: cart.map(({ productoId, cantidad }) => ({ productoId, cantidad })),
      });
      if (!result.ok) {
        idempotencyKey.current = null;
        setOutcomeUnknown(false);
        setCheckoutError(result.error);
        return;
      }
      setOutcomeUnknown(false);
      setSuccess(result.data);
      setCart([]);
      setCustomerId("");
      setSearch("");
      idempotencyKey.current = null;
      setReviewOpen(false);
      void productsRequest.reload();
      toast.success(result.data.replayed ? "La venta ya estaba registrada." : "Venta registrada correctamente.");
    } catch {
      setOutcomeUnknown(true);
      setCheckoutError("No se pudo confirmar la respuesta del servidor. Reintentá la misma confirmación antes de cambiar los datos.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function closeReview() {
    if (!submitting && !outcomeUnknown) setReviewOpen(false);
  }

  function startAnotherSale() {
    setSuccess(null);
    setCheckoutError(null);
    setSearch("");
    setCustomerId("");
    setCart([]);
  }

  return (
    <main className="space-y-6">
      <PageHeader
        title="Nueva venta"
        description="Buscá productos, armá el carrito y confirmá la operación."
      />

      <div className="sticky top-0 z-20 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex min-w-0 items-center gap-2">
          <ShoppingCart className="h-4 w-4 shrink-0 text-brand-600" />
          <span className="truncate text-sm font-medium">{cartQuantity} producto{cartQuantity !== 1 ? "s" : ""}</span>
          <span className="font-semibold">{formatCents(cartTotalCents)}</span>
        </div>
        <a href="#carrito" className="shrink-0 text-sm font-semibold text-brand-600 hover:text-brand-700">
          Ver carrito
        </a>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="card min-w-0 overflow-hidden">
          <div className="border-b border-slate-200 p-5 dark:border-slate-800">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
                <Package className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold">Productos</h2>
                <p className="text-sm text-slate-500">Buscá por nombre o SKU</p>
              </div>
            </div>
            <Input
              aria-label="Buscar producto por nombre o SKU"
              placeholder="Nombre o SKU..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleSearchKeyDown}
              icon={<Search className="h-4 w-4" />}
              autoComplete="off"
            />
            <p className="mt-2 text-xs text-slate-500">Usá ↑ y ↓ para recorrer resultados y Enter para agregar.</p>
          </div>

          {productsRequest.loading ? (
            <Loading label="Cargando productos..." />
          ) : productsRequest.error ? (
            <ErrorState message={productsRequest.error} onRetry={() => void productsRequest.reload()} />
          ) : visibleProducts.length === 0 ? (
            <EmptyState
              title={search.trim() ? "No encontramos coincidencias" : "No hay productos disponibles"}
              description={search.trim() ? "Probá con otro nombre o SKU." : "Agregá productos activos para iniciar una venta."}
              icon={<Search className="h-6 w-6" />}
            />
          ) : (
            <div className="max-h-[65vh] overflow-y-auto p-3 sm:p-4" role="listbox" aria-label="Productos disponibles">
              <div className="grid gap-2 sm:grid-cols-2">
                {visibleProducts.map((product, index) => {
                  const inCart = cart.find((line) => line.productoId === product.id)?.cantidad ?? 0;
                  const outOfStock = product.stock <= 0;
                  const limitReached = inCart >= Math.min(product.stock, MAX_LINE_QUANTITY);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      disabled={outOfStock || limitReached}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => addProduct(product)}
                      className={`flex min-h-[100px] items-center gap-3 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                        index === activeIndex
                          ? "border-brand-300 bg-brand-50/70 dark:border-brand-800 dark:bg-brand-900/20"
                          : "border-slate-200 bg-white hover:border-brand-200 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/60"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800">
                        <Package className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{product.nombre}</span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">SKU {product.sku}</span>
                        <span className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-brand-700 dark:text-brand-300">{formatMoney(product.precioVenta)}</span>
                          <span className={`text-xs font-medium ${outOfStock ? "text-red-600 dark:text-red-400" : "text-slate-500"}`}>
                            {outOfStock ? "Sin stock" : `Stock ${product.stock}`}
                          </span>
                        </span>
                      </span>
                      <Plus className="h-4 w-4 shrink-0 text-brand-600" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <section id="carrito" className="card scroll-mt-20 overflow-hidden xl:sticky xl:top-4">
          <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300">
                <ShoppingCart className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold">Carrito</h2>
                <p className="text-sm text-slate-500">{cartQuantity} unidad{cartQuantity !== 1 ? "es" : ""}</p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!cart.length || submitting}
              onClick={() => setClearOpen(true)}
              icon={<Trash2 className="h-3.5 w-3.5" />}
            >
              Vaciar
            </Button>
          </div>

          {cart.length === 0 ? (
            <EmptyState title="El carrito está vacío" description="Agregá productos desde la lista para comenzar." icon={<ShoppingCart className="h-6 w-6" />} />
          ) : (
            <div className="max-h-[38vh] space-y-3 overflow-y-auto p-4">
              {cart.map((line) => {
                const product = products.find((item) => item.id === line.productoId);
                if (!product) return null;
                const unitCents = Math.round(product.precioVenta * 100);
                const subtotalCents =
                  unitCents > Math.floor(MAX_TOTAL_CENTS / line.cantidad)
                    ? MAX_TOTAL_CENTS + 1
                    : unitCents * line.cantidad;
                const maxQuantity = Math.min(product.stock, MAX_LINE_QUANTITY);
                return (
                  <article key={line.productoId} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold">{product.nombre}</h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {formatCents(unitCents)} c/u · {product.stock} disponibles
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label={`Quitar ${product.nombre} del carrito`}
                        onClick={() => removeProduct(product.id)}
                      >
                        <X className="h-4 w-4 text-slate-500" />
                      </Button>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          className="h-8 w-8"
                          aria-label={`Disminuir cantidad de ${product.nombre}`}
                          disabled={line.cantidad <= 1}
                          onClick={() => updateQuantity(product.id, line.cantidad - 1)}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <Input
                          type="number"
                          min={1}
                          max={maxQuantity}
                          value={line.cantidad}
                          aria-label={`Cantidad de ${product.nombre}`}
                          className="h-8 w-16 px-2 text-center"
                          onChange={(event) => updateQuantity(product.id, Number(event.target.value))}
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          className="h-8 w-8"
                          aria-label={`Aumentar cantidad de ${product.nombre}`}
                          disabled={line.cantidad >= maxQuantity}
                          onClick={() => updateQuantity(product.id, line.cantidad + 1)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <span className="text-sm font-bold">{formatCents(subtotalCents)}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div className="space-y-4 border-t border-slate-200 p-5 dark:border-slate-800">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <UserRound className="h-4 w-4 text-slate-500" />
                Datos de la venta
              </div>
              <Select
                aria-label="Cliente (opcional)"
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
                placeholder="Consumidor final (sin cliente)"
                options={customers.map((customer) => ({
                  value: customer.id,
                  label: `${customer.nombre} ${customer.apellido}${customer.empresa ? ` · ${customer.empresa}` : ""}`,
                }))}
              />
              {customersRequest.loading ? (
                <p className="text-xs text-slate-500">Cargando clientes disponibles...</p>
              ) : customersRequest.error ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <p className="text-amber-700 dark:text-amber-300">No se pudieron cargar clientes; podés continuar como consumidor final.</p>
                  <Button type="button" size="sm" variant="secondary" onClick={() => void customersRequest.reload()}>
                    Reintentar
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-slate-500">Opcional. Si no seleccionás uno, se registrará como consumidor final.</p>
              )}
              {selectedCustomer && (
                <p className="text-xs text-slate-500">
                  {selectedCustomer.telefono || "Sin teléfono"} · {selectedCustomer.ciudad || "Sin ciudad"}
                </p>
              )}
            </div>

            {checkoutError && !reviewOpen && (
              <div role="alert" className="flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{checkoutError}</span>
              </div>
            )}
            {!canMove && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Tu cuenta no tiene permiso para registrar movimientos de stock.
              </p>
            )}

            <div className="border-t border-dashed border-slate-200 pt-4 dark:border-slate-800">
              <div className="flex items-center justify-between text-sm text-slate-500">
                <span>Subtotal</span>
                <span>{formatCents(cartTotalCents)}</span>
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <span className="font-semibold">Total</span>
                <span className="text-2xl font-bold tracking-tight text-brand-700 dark:text-brand-300">{formatCents(cartTotalCents)}</span>
              </div>
            </div>
            {cartTotalCents > MAX_TOTAL_CENTS && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                El importe supera el máximo que admite el registro de ventas.
              </p>
            )}

            <Button
              type="button"
              className="h-12 w-full text-base"
              disabled={!cart.length || cartTotalCents > MAX_TOTAL_CENTS || !canMove}
              onClick={openReview}
              icon={<CheckCircle2 className="h-5 w-5" />}
            >
              Confirmar venta
            </Button>
            <p className="text-center text-xs text-slate-500">El stock se valida y descuenta al confirmar.</p>
          </div>
        </section>
      </div>

      <Modal
        open={reviewOpen || Boolean(success)}
        onClose={success ? () => setSuccess(null) : closeReview}
        title={success ? "Venta registrada" : "Confirmar venta"}
        description={success ? "La venta se registró correctamente." : "Revisá el total antes de registrar la operación."}
        size="sm"
        footer={
          success ? (
            <>
              <Button type="button" variant="secondary" onClick={() => router.push("/orders")}>
                Ver historial
              </Button>
              <Button type="button" onClick={startAnotherSale}>
                Nueva venta
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={closeReview} disabled={submitting || outcomeUnknown}>
                Volver
              </Button>
              <Button type="button" loading={submitting} onClick={() => void confirmSale()}>
                Confirmar por {formatCents(cartTotalCents)}
              </Button>
            </>
          )
        }
      >
        {success ? (
          <div className="space-y-4 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300">
              <CheckCircle2 className="h-7 w-7" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Identificador</p>
              <p className="mt-1 font-mono text-lg font-bold">{shipmentCode(success.id)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-left dark:bg-slate-800/60">
              <div>
                <p className="text-xs text-slate-500">Fecha</p>
                <p className="mt-1 text-sm font-medium">{formatDateTime(success.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total</p>
                <p className="mt-1 text-sm font-bold">{formatMoney(Number(success.total))}</p>
              </div>
            </div>
            {success.replayed && (
              <p className="text-xs text-slate-500">La solicitud ya se había procesado; se muestra la venta existente.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl bg-brand-50 p-4 dark:bg-brand-900/20">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Cliente: <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {selectedCustomer ? `${selectedCustomer.nombre} ${selectedCustomer.apellido}` : "Consumidor final"}
                </span>
              </p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Unidades: {cartQuantity}</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Total a registrar</p>
              <p className="mt-1 text-2xl font-bold text-brand-700 dark:text-brand-300">{formatCents(cartTotalCents)}</p>
            </div>
            {checkoutError && (
              <div role="alert" className="flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{checkoutError}</span>
              </div>
            )}
            {submitting && <p className="text-center text-sm text-slate-500">Validando stock y registrando la venta...</p>}
            {outcomeUnknown && (
              <p className="text-center text-xs text-amber-700 dark:text-amber-300">
                El carrito queda bloqueado para evitar una venta duplicada. Reintentá para consultar el resultado con la misma clave.
              </p>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={() => {
          setCart([]);
          setClearOpen(false);
        }}
        title="Vaciar carrito"
        message="¿Querés quitar todos los productos del carrito? Esta acción no se puede deshacer."
        confirmLabel="Vaciar carrito"
        loading={false}
      />
    </main>
  );
}
