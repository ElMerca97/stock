import type { ReceiptBusinessInfo } from "@/types";

/**
 * Configuración centralizada del negocio.
 *
 * Los valores sensibles o específicos del despliegue se leen de variables de
 * entorno (ver .env.example). Los valores por defecto corresponden a la
 * identidad comercial de Ferretería Lausana y nunca deben exponerse al
 * frontend si contienen credenciales.
 */
export interface BusinessConfig {
  nombreComercial: string;
  razonSocial: string | null;
  rut: string | null;
  direccionFiscal: string | null;
  telefono: string | null;
  email: string | null;
  moneda: string;
  logoUrl: string | null;
  politicaDevolucion: string | null;
  facturacionElectronica: {
    proveedor: string | null;
    entorno: string;
    habilitada: boolean;
  };
}

export function getBusinessConfig(): BusinessConfig {
  const logo = process.env.BUSINESS_LOGO_URL?.trim() ?? "";
  const validLogo = logo.startsWith("/api/storage/") || logo.startsWith("https://");

  return {
    nombreComercial: process.env.BUSINESS_NAME?.trim() || "Ferretería Lausana",
    razonSocial: process.env.BUSINESS_LEGAL_NAME?.trim() || null,
    rut: process.env.BUSINESS_RUT?.trim() || null,
    direccionFiscal: process.env.BUSINESS_ADDRESS?.trim() || null,
    telefono: process.env.BUSINESS_PHONE?.trim() || null,
    email: process.env.BUSINESS_EMAIL?.trim() || null,
    moneda: process.env.BUSINESS_CURRENCY?.trim() || "UYU",
    logoUrl: validLogo ? logo : null,
    politicaDevolucion: process.env.BUSINESS_RETURN_POLICY?.trim() || null,
    facturacionElectronica: {
      proveedor: process.env.DGI_PROVIDER?.trim() || null,
      entorno: process.env.DGI_ENVIRONMENT?.trim() || "homologacion",
      habilitada: process.env.DGI_ENABLED?.trim().toLowerCase() === "true",
    },
  };
}

export function getReceiptBusinessInfo(): ReceiptBusinessInfo {
  const config = getBusinessConfig();
  return {
    nombre: config.nombreComercial,
    direccion: config.direccionFiscal,
    telefono: config.telefono,
    rut: config.rut,
    logoUrl: config.logoUrl,
    politicaDevolucion: config.politicaDevolucion,
  };
}
