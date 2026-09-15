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

async function apiMutate<T>(method: "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(b?.error?.message ?? `${res.status} ${res.statusText}`);
  }
  return res.status === 204 ? (undefined as T) : (res.json() as Promise<T>);
}
export const apiPost = <T>(path: string, body?: unknown) => apiMutate<T>("POST", path, body);
export const apiPut = <T>(path: string, body?: unknown) => apiMutate<T>("PUT", path, body);
export const apiDelete = <T>(path: string) => apiMutate<T>("DELETE", path);

type State<T> = { data?: T; error?: string; loading: boolean };

/** Hook simples de fetch. Refaz quando o `key` muda (ex.: filtros serializados,
 *  ou um `bump()` de cache-busting depois de uma mutação). Mantém `data`/
 *  `error` do fetch anterior durante o refetch (só `loading` vira true) --
 *  sem isso, cada refetch derrubava `data` pra undefined por um instante e a
 *  tela inteira desmontava/remontava (efeito de "piscar"/recarregar visível
 *  a cada clique num toggle, ex. aba ADM). */
export function useApi<T>(path: string, params?: Record<string, string | undefined>): State<T> {
  const key = path + JSON.stringify(params ?? {});
  const [state, setState] = useState<State<T>>({ loading: true });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    apiGet<T>(path, params)
      .then((data) => alive && setState({ data, loading: false }))
      .catch((e) => alive && setState((s) => ({ ...s, error: String(e.message ?? e), loading: false })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

/** Estado de uma mutação (POST/PUT/DELETE) — sem cache/invalidação, o caller
 *  refaz o fetch da lista depois de `run` resolver (mesmo espírito simples
 *  de `useApi`; não compensa trazer react-query/SWR pra uma tela de admin). */
export function useMutationState<T>() {
  const [state, setState] = useState<{ loading: boolean; error?: string }>({ loading: false });
  const run = async (fn: () => Promise<T>): Promise<T> => {
    setState({ loading: true });
    try {
      const r = await fn();
      setState({ loading: false });
      return r;
    } catch (e) {
      setState({ loading: false, error: String((e as Error).message ?? e) });
      throw e;
    }
  };
  return { ...state, run };
}
