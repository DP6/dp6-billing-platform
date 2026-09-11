import { useEffect, useState } from "react";

const BASE = import.meta.env.VITE_API_BASE ?? "";

export async function apiGet<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v != null && v !== "") qs.set(k, v);
  const url = `${BASE}/api${path}${qs.toString() ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

type State<T> = { data?: T; error?: string; loading: boolean };

/** Hook simples de fetch. Refaz quando o `key` muda (ex.: filtros serializados). */
export function useApi<T>(path: string, params?: Record<string, string | undefined>): State<T> {
  const key = path + JSON.stringify(params ?? {});
  const [state, setState] = useState<State<T>>({ loading: true });
  useEffect(() => {
    let alive = true;
    setState({ loading: true });
    apiGet<T>(path, params)
      .then((data) => alive && setState({ data, loading: false }))
      .catch((e) => alive && setState({ error: String(e.message ?? e), loading: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}
