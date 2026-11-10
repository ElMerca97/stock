interface EmailConfig {
  apiKey: string;
  from: string;
  appUrl: URL;
}

function getEmailConfig(): EmailConfig {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const appUrlValue = process.env.APP_URL?.trim();
  if (!apiKey || !from || !appUrlValue) {
    throw new Error("La recuperación por correo no está configurada. Configurá RESEND_API_KEY, EMAIL_FROM y APP_URL.");
  }

  let appUrl: URL;
  try {
    appUrl = new URL(appUrlValue);
  } catch {
    throw new Error("APP_URL debe ser una URL absoluta válida.");
  }
  if (appUrl.protocol !== "https:" && appUrl.protocol !== "http:") {
    throw new Error("APP_URL debe utilizar HTTP o HTTPS.");
  }
  if (appUrl.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("APP_URL debe utilizar HTTPS en producción.");
  }
  return { apiKey, from, appUrl };
}

export function assertEmailConfigured(): void {
  getEmailConfig();
}

export async function sendPasswordResetEmail(to: string, token: string | null): Promise<void> {
  const { apiKey, from, appUrl } = getEmailConfig();
  const resetUrl = token
    ? new URL(`/reset-password?token=${encodeURIComponent(token)}`, appUrl).toString()
    : null;
  const text = resetUrl
    ? `Se solicitó restablecer una contraseña. Usá este enlace dentro de una hora: ${resetUrl}\n\nSi no solicitaste el cambio, ignorá este correo.`
    : "Se solicitó restablecer una contraseña para esta dirección. Si existe una cuenta asociada, recibirá las instrucciones. Si no solicitaste el cambio, ignorá este correo.";
  const html = resetUrl
    ? `<p>Se solicitó restablecer una contraseña.</p><p><a href="${resetUrl}">Elegir una nueva contraseña</a></p><p>El enlace vence en una hora. Si no solicitaste el cambio, ignorá este correo.</p>`
    : "<p>Se solicitó restablecer una contraseña para esta dirección.</p><p>Si existe una cuenta asociada, recibirá las instrucciones. Si no solicitaste el cambio, ignorá este correo.</p>";

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "Instrucciones para restablecer tu contraseña",
        text,
        html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error("[password-reset] No se pudo contactar al proveedor de correo.", {
      error: error instanceof Error ? error.name : "unknown",
    });
    throw new Error("No se pudieron enviar las instrucciones. Intentá nuevamente más tarde.");
  }

  if (!response.ok) {
    console.error("[password-reset] El proveedor de correo rechazó el envío.", { status: response.status });
    throw new Error("No se pudieron enviar las instrucciones. Intentá nuevamente más tarde.");
  }
}
