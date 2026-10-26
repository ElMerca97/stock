"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SessionUser } from "@/types";

const Ctx = createContext<SessionUser | null>(null);

export function AuthProvider({ user, children }: { user: SessionUser; children: ReactNode }) {
  return <Ctx.Provider value={user}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const u = useContext(Ctx);
  if (!u) throw new Error("useAuth must be used inside AuthProvider");
  return { user: u, isAdmin: u.rol === "admin", canMove: u.puedeMovimientos };
}
