"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionResult } from "@/types";

/**
 * Runs an async server action whenever `deps` change. Handles loading/error/data
 * and discards stale responses.
 */
export function useAsync<T>(fn: () => Promise<ActionResult<T>>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  const fnRef = useRef(fn);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const run = useCallback(async () => {
    const id = ++reqId.current;
    // setState diferido a microtask: el efecto solo se suscribe (cumple react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      if (id !== reqId.current) return;
      setLoading(true);
      setError(null);
    });
    try {
      const r = await fnRef.current();
      if (id !== reqId.current) return;
      if (r.ok) {
        setData(r.data);
        setError(null);
      } else {
        // Un error reemplaza los datos previos: no se muestran datos obsoletos como actuales.
        setError(r.error);
        setData(undefined);
      }
    } catch {
      if (id === reqId.current) {
        setError("No se pudo conectar con el servidor.");
        setData(undefined);
      }
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void run();
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload: run, setData };
}
