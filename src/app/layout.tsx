import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { ThemeProvider, themeScript } from "@/contexts/ThemeContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "StockPro — Gestión de stock para distribuidoras",
  description: "Control de inventario, productos, clientes y envíos para distribuidoras.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          {children}
          <Toaster richColors position="top-right" closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
