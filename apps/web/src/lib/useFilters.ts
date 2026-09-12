import { useSearchParams } from "react-router-dom";

export type Period = "mes" | "30d" | "90d" | "ano" | "custom";

export const PERIOD_LABELS: Record<Period, string> = {
  mes: "Mês corrente",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  ano: "Este ano",
  custom: "Personalizado",
};

export interface Filters {
  period: Period;
  from?: string; // só quando period === "custom"
  to?: string;
  service?: string;
  environment?: string;
  app?: string;
  currency: "BRL" | "USD";
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return iso(d);
};

/** Resolve o preset (ou o range custom) numa janela {from,to} concreta. */
export function resolveWindow(f: Filters): { from: string; to: string } {
  const today = iso(new Date());
  switch (f.period) {
    case "30d":
      return { from: daysAgo(29), to: today };
    case "90d":
      return { from: daysAgo(89), to: today };
    case "ano": {
      const d = new Date();
      return { from: `${d.getUTCFullYear()}-01-01`, to: today };
    }
    case "custom":
      return { from: f.from ?? daysAgo(29), to: f.to ?? today };
    default: {
      // "mes": dia 1 do mês corrente -> hoje
      const d = new Date();
      const first = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
      return { from: first, to: today };
    }
  }
}

const STORAGE = "pcm:filters";

function readStored(): Partial<Pick<Filters, "period" | "currency">> {
  try {
    const raw = localStorage.getItem(STORAGE);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Estado dos filtros globais na querystring (links compartilháveis).
 *  `pcm:filters` só pré-preenche period/currency quando a URL não traz nada. */
export function useFilters(): [Filters, (patch: Partial<Filters>) => void] {
  const [sp, setSp] = useSearchParams();
  const stored = readStored();

  const hasCustom = sp.has("from") || sp.has("to");
  const rawPeriod = (sp.get("period") as Period | null) ?? (hasCustom ? "custom" : null);
  const period: Period = rawPeriod ?? stored.period ?? "mes";

  const f: Filters = {
    period,
    from: period === "custom" ? (sp.get("from") ?? undefined) : undefined,
    to: period === "custom" ? (sp.get("to") ?? undefined) : undefined,
    service: sp.get("service") ?? undefined,
    environment: sp.get("environment") ?? undefined,
    app: sp.get("app") ?? undefined,
    currency: (sp.get("currency") as "BRL" | "USD") ?? stored.currency ?? "BRL",
  };

  const set = (patch: Partial<Filters>) => {
    const next = new URLSearchParams(sp);
    const apply = (k: string, v: string | undefined) => {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    };
    if ("period" in patch) {
      const p = patch.period as Period;
      if (p === "custom") {
        next.set("period", "custom");
      } else {
        next.set("period", p);
        next.delete("from");
        next.delete("to");
      }
    }
    if ("from" in patch) apply("from", patch.from);
    if ("to" in patch) apply("to", patch.to);
    for (const k of ["service", "environment", "app", "currency"] as const) {
      if (k in patch) apply(k, patch[k] as string | undefined);
    }
    setSp(next, { replace: true });

    const merged = { period: patch.period ?? f.period, currency: patch.currency ?? f.currency };
    try {
      localStorage.setItem(STORAGE, JSON.stringify(merged));
    } catch {
      /* modo privado */
    }
  };

  return [f, set];
}

/** Params para os endpoints de série (janela + recorte). */
export const filterParams = (f: Filters): Record<string, string | undefined> => {
  const { from, to } = resolveWindow(f);
  return {
    from,
    to,
    service: f.service,
    environment: f.environment,
    app: f.app,
    currency: f.currency,
  };
};

/** Params para os endpoints mês-âncora (recorte, sem janela). */
export const scopeParams = (f: Filters): Record<string, string | undefined> => ({
  service: f.service,
  environment: f.environment,
  app: f.app,
  currency: f.currency,
});

export const hasActiveFilters = (f: Filters): boolean =>
  f.period !== "mes" || !!f.service || !!f.environment || !!f.app || f.currency !== "BRL";
