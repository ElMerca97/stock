export class DgiError extends Error {
  constructor(message: string, public readonly code = "DGI_ERROR") {
    super(message);
    this.name = "DgiError";
  }
}

export class ProviderNotConfiguredError extends DgiError {
  constructor(message = "El proveedor de facturación electrónica no está configurado. Completá las variables de entorno DGI_* y habilitá la integración.") {
    super(message, "PROVIDER_NOT_CONFIGURED");
    this.name = "ProviderNotConfiguredError";
  }
}

export class FiscalValidationError extends DgiError {
  constructor(message: string) {
    super(message, "FISCAL_VALIDATION_ERROR");
    this.name = "FiscalValidationError";
  }
}

export class FiscalIdempotencyError extends DgiError {
  constructor(message: string) {
    super(message, "FISCAL_IDEMPOTENCY_ERROR");
    this.name = "FiscalIdempotencyError";
  }
}

export function toPublicError(error: unknown): string {
  if (error instanceof DgiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Error desconocido en la integración fiscal.";
}
