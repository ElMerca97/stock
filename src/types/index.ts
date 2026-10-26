export type Role = "admin" | "empleado";

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

export interface SessionUser {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  rol: Role;
  puedeMovimientos: boolean;
  avatar: string | null;
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const SHIPMENT_STATES = [
  "pendiente",
  "preparando",
  "listo",
  "enviado",
  "entregado",
  "cancelado",
] as const;
export type ShipmentState = (typeof SHIPMENT_STATES)[number];

export const SHIPMENT_STATE_LABELS: Record<ShipmentState, string> = {
  pendiente: "Pendiente",
  preparando: "Preparando",
  listo: "Listo para enviar",
  enviado: "Enviado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

/** States in which the shipment's stock has been deducted from inventory. */
export const STOCK_DEDUCTED_STATES: ShipmentState[] = ["preparando", "listo", "enviado", "entregado"];

export const MOVEMENT_TYPES = ["entrada", "salida", "ajuste"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const PRODUCT_TYPES = ["Unidad", "Pack", "Caja", "Bulto", "Kg", "Litro"];

export interface CategoryDTO {
  id: number;
  nombre: string;
  descripcion: string;
  imagen: string | null;
  activo: boolean;
  createdAt: string;
  productCount: number;
}

export interface ProductDTO {
  id: number;
  nombre: string;
  sku: string;
  categoriaId: number | null;
  categoriaNombre: string | null;
  tipo: string;
  descripcion: string;
  precioCompra: number;
  precioVenta: number;
  stock: number;
  stockMinimo: number;
  imagen: string | null;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MovementDTO {
  id: number;
  productoId: number;
  productoNombre: string;
  productoSku: string;
  categoriaNombre: string | null;
  tipo: MovementType;
  cantidad: number;
  stockAnterior: number;
  stockNuevo: number;
  usuarioNombre: string | null;
  envioId: number | null;
  motivo: string;
  createdAt: string;
}

export interface CustomerDTO {
  id: number;
  nombre: string;
  apellido: string;
  empresa: string;
  telefono: string;
  email: string;
  direccion: string;
  ciudad: string;
  departamento: string;
  observaciones: string;
  createdAt: string;
  shipmentCount: number;
}

export interface ShipmentItemDTO {
  id: number;
  productoId: number;
  productoNombre: string;
  productoSku: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface ShipmentDTO {
  id: number;
  clienteId: number;
  clienteNombre: string;
  clienteEmpresa: string;
  estado: ShipmentState;
  total: number;
  telefono: string;
  direccion: string;
  ciudad: string;
  observaciones: string;
  stockDescontado: boolean;
  createdAt: string;
  fechaEnvio: string | null;
  fechaEntrega: string | null;
  itemCount: number;
  items?: ShipmentItemDTO[];
}

export interface AlertDTO {
  productoId: number;
  nombre: string;
  sku: string;
  categoriaNombre: string | null;
  stock: number;
  stockMinimo: number;
  tipo: "bajo" | "agotado";
  imagen: string | null;
  visto: boolean;
}

export interface UserDTO {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  rol: Role;
  puedeMovimientos: boolean;
  avatar: string | null;
  activo: boolean;
  createdAt: string;
}
