import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  // Raíz explícita del proyecto: evita que Turbopack infiera un package-lock.json
  // de una carpeta superior (p. ej. la carpeta de usuario) como raíz del workspace.
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
};

export default nextConfig;
