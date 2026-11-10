"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionResult } from "@/types";

/**
 * Runs an async server action whenever `deps` change. Handles loading/error/data
 * and discards stale responses. Manages loading phase properly so the UI never
 * shows "loading forever".
 */
export function useAsync<T>(fn: () => Promise<ActionResult<T>>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  const fnRef = useRef(fn);
  const depsRef = useRef(deps);

  // Keep fnRef current when fn changes.
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const run = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const r = await fnRef.current();
      if (id !== reqId.current) return;
      if (r.ok) {
        setData(r.data);
        setError(null);
      } else {
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
  }, [fn]);

  // Re-run whenever deps change.
  useEffect(() => {
    const prev = depsRef.current;
    const changed =
      deps.length !== prev.length ||
      deps.some((d, i) => d !== prev[i]);
    depsRef.current = deps;

    if (changed || prev.length === 0) {
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload: run, setData };
}
