import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  serial,
  integer,
  numeric,
  jsonb,
  primaryKey,
  index,
  check,
} from "drizzle-orm/pg-core";
import type { ReceiptBusinessInfo } from "@/types";

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  apellido: text("apellido").notNull().default(""),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  rol: text("rol").notNull().default("empleado"), // admin | empleado
  puedeMovimientos: boolean("puede_movimientos").notNull().default(true),
  avatar: text("avatar"),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256 of token
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const passwordResets = pgTable("password_resets", {
  id: text("id").primaryKey(), // sha256 of token
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Contador persistente de intentos fallidos de autenticación (login / reset password). */
export const authAttempts = pgTable("auth_attempts", {
  key: text("key").primaryKey(), // p. ej. "login:email:u@x.com" | "login:ip:1.2.3.4"
  failures: integer("failures").notNull().default(0),
  firstFailureAt: timestamp("first_failure_at", { withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull().unique(),
  descripcion: text("descripcion").notNull().default(""),
  imagen: text("imagen"),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    nombre: text("nombre").notNull(),
    sku: text("sku").notNull().unique(),
    categoriaId: integer("categoria_id").references(() => categories.id, { onDelete: "restrict" }),
    tipo: text("tipo").notNull().default("Unidad"),
    descripcion: text("descripcion").notNull().default(""),
    precioCompra: numeric("precio_compra", { precision: 12, scale: 2 }).notNull().default("0"),
    precioVenta: numeric("precio_venta", { precision: 12, scale: 2 }).notNull().default("0"),
    stock: integer("stock").notNull().default(0),
    stockReservado: integer("stock_reservado").notNull().default(0),
    stockMinimo: integer("stock_minimo").notNull().default(0),
    imagen: text("imagen"),
    activo: boolean("activo").notNull().default(true),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("products_categoria_idx").on(t.categoriaId),
    check("products_stock_reservado_check", sql`${t.stockReservado} >= 0 and ${t.stockReservado} <= ${t.stock}`),
  ],
);

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  apellido: text("apellido").notNull().default(""),
  empresa: text("empresa").notNull().default(""),
  telefono: text("telefono").notNull().default(""),
  email: text("email").notNull().default(""),
  descuentoPorcentaje: numeric("descuento_porcentaje", { precision: 5, scale: 2 }).notNull().default("0"),
  direccion: text("direccion").notNull().default(""),
  ciudad: text("ciudad").notNull().default(""),
  departamento: text("departamento").notNull().default(""),
  observaciones: text("observaciones").notNull().default(""),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check("customers_descuento_porcentaje_check", sql`${t.descuentoPorcentaje} >= 0 and ${t.descuentoPorcentaje} <= 100`)]);

export const shipments = pgTable(
  "shipments",
  {
    id: serial("id").primaryKey(),
    clienteId: integer("cliente_id")
      .references(() => customers.id, { onDelete: "restrict" }),
    estado: text("estado").notNull().default("pendiente"),
    total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
    descuentoPorcentaje: numeric("descuento_porcentaje", { precision: 5, scale: 2 }).notNull().default("0"),
    descuentoImporte: numeric("descuento_importe", { precision: 14, scale: 2 }).notNull().default("0"),
    telefono: text("telefono").notNull().default(""),
    direccion: text("direccion").notNull().default(""),
    ciudad: text("ciudad").notNull().default(""),
    clienteNombreSnapshot: text("cliente_nombre_snapshot").notNull().default("Consumidor final"),
    receiptBusinessSnapshot: jsonb("receipt_business_snapshot").$type<ReceiptBusinessInfo>(),
    observaciones: text("observaciones").notNull().default(""),
    stockDescontado: boolean("stock_descontado").notNull().default(false),
    stockReservado: boolean("stock_reservado").notNull().default(false),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    fechaEnvio: timestamp("fecha_envio", { withTimezone: true }),
    fechaEntrega: timestamp("fecha_entrega", { withTimezone: true }),
  },
  (t) => [
    index("shipments_cliente_idx").on(t.clienteId),
    index("shipments_estado_idx").on(t.estado),
    check("shipments_descuento_porcentaje_check", sql`${t.descuentoPorcentaje} >= 0 and ${t.descuentoPorcentaje} <= 100`),
    check("shipments_descuento_importe_check", sql`${t.descuentoImporte} >= 0 and ${t.descuentoImporte} <= ${t.subtotal}`),
    check("shipments_total_check", sql`${t.total} = ${t.subtotal} - ${t.descuentoImporte}`),
  ],
);

export const shipmentItems = pgTable("shipment_items", {
  id: serial("id").primaryKey(),
  envioId: integer("envio_id")
    .notNull()
    .references(() => shipments.id, { onDelete: "cascade" }),
  productoId: integer("producto_id")
    .notNull()
    .references(() => products.id, { onDelete: "restrict" }),
  productoNombre: text("producto_nombre").notNull(),
  productoSku: text("producto_sku").notNull().default(""),
  cantidad: integer("cantidad").notNull(),
  precioUnitario: numeric("precio_unitario", { precision: 12, scale: 2 }).notNull(),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
});

export const saleRequests = pgTable("sale_requests", {
  idempotencyKey: uuid("idempotency_key").primaryKey(),
  requestHash: text("request_hash").notNull(),
  shipmentId: integer("shipment_id")
    .notNull()
    .unique()
    .references(() => shipments.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: serial("id").primaryKey(),
    productoId: integer("producto_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    tipo: text("tipo").notNull(), // entrada | salida | ajuste
    cantidad: integer("cantidad").notNull(),
    stockAnterior: integer("stock_anterior").notNull(),
    stockNuevo: integer("stock_nuevo").notNull(),
    usuarioId: uuid("usuario_id").references(() => profiles.id, { onDelete: "set null" }),
    envioId: integer("envio_id").references(() => shipments.id, { onDelete: "set null" }),
    motivo: text("motivo").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("movements_producto_idx").on(t.productoId), index("movements_created_idx").on(t.createdAt)],
);

export const alertReads = pgTable(
  "alert_reads",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    productoId: integer("producto_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(), // bajo | agotado
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productoId] })],
);

export const storageFiles = pgTable("storage_files", {
  path: text("path").primaryKey(), // e.g. products/uuid.png
  bucket: text("bucket").notNull(), // products | categories | avatars
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  data: text("data").notNull(), // base64
  ownerId: uuid("owner_id").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const fiscalSettings = pgTable("fiscal_settings", {
  id: integer("id").primaryKey().default(1),
  enabled: boolean("enabled").notNull().default(false),
  provider: text("provider").notNull().default("none"),
  environment: text("environment").notNull().default("homologacion"),
  defaultCfeType: text("default_cfe_type").notNull().default("e-ticket"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
});

export const cfeDocuments = pgTable(
  "cfe_documents",
  {
    id: serial("id").primaryKey(),
    saleId: integer("sale_id")
      .notNull()
      .unique()
      .references(() => shipments.id, { onDelete: "cascade" }),
    cfeType: text("cfe_type").notNull(),
    serie: text("serie"),
    numero: text("numero"),
    provider: text("provider").notNull().default("none"),
    providerDocumentId: text("provider_document_id"),
    status: text("status").notNull().default("pending"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    authorizationCode: text("authorization_code"),
    documentUrl: text("document_url"),
    errorMessage: text("error_message"),
    providerResponse: jsonb("provider_response").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cfe_documents_sale_idx").on(t.saleId), index("cfe_documents_status_idx").on(t.status)],
);

