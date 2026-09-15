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
  project?: string;
}

// "hoje" em America/Sao_Paulo -- o mesmo fuso que o backend usa em todo CURRENT_DATE(...)
// (scorecard, budget, coverage, etc.). Sem isso, o navegador calcula "hoje"/"1º do mês" em
// UTC e diverge do servidor (BRT = UTC-3) — foi a causa de "Custo líquido" (usa from/to,
// calculado aqui) não bater com métricas MTD calculadas direto no servidor.
function todaySaoPaulo(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [y, m, d] = parts.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)); // meia-noite UTC representando o dia calendário SP
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = todaySaoPaulo();
  d.setUTCDate(d.getUTCDate() - n);
  return iso(d);
};

/** Resolve o preset (ou o range custom) numa janela {from,to} concreta. */
export function resolveWindow(f: Filters): { from: string; to: string } {
  const today = iso(todaySaoPaulo());
  switch (f.period) {
    case "30d":
      return { from: daysAgo(29), to: today };
    case "90d":
      return { from: daysAgo(89), to: today };
    case "ano": {
      const d = todaySaoPaulo();
      return { from: `${d.getUTCFullYear()}-01-01`, to: today };
    }
    case "custom":
      return { from: f.from ?? daysAgo(29), to: f.to ?? today };
    default: {
      // "mes": dia 1 do mês corrente -> hoje
      const d = todaySaoPaulo();
      const first = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
      return { from: first, to: today };
    }
  }
}

const STORAGE = "pcm:filters";

function readStored(): Partial<Filters> {
  try {
    const raw = localStorage.getItem(STORAGE);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Estado dos filtros globais na querystring (links compartilháveis).
 *  `pcm:filters` pré-preenche qualquer campo ausente na URL (aba nova/sessão nova sem
 *  querystring) -- navegação normal entre telas já persiste via NavLink + search. */
export function useFilters(): [Filters, (patch: Partial<Filters>) => void] {
  const [sp, setSp] = useSearchParams();
  const stored = readStored();

  const hasCustom = sp.has("from") || sp.has("to");
  const rawPeriod = (sp.get("period") as Period | null) ?? (hasCustom ? "custom" : null);
  const period: Period = rawPeriod ?? stored.period ?? "mes";

  const f: Filters = {
    period,
    from: period === "custom" ? (sp.get("from") ?? stored.from ?? undefined) : undefined,
    to: period === "custom" ? (sp.get("to") ?? stored.to ?? undefined) : undefined,
    service: sp.get("service") ?? stored.service ?? undefined,
    environment: sp.get("environment") ?? stored.environment ?? undefined,
    app: sp.get("app") ?? stored.app ?? undefined,
    project: sp.get("project") ?? stored.project ?? undefined,
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
    for (const k of ["service", "environment", "app", "project"] as const) {
      if (k in patch) apply(k, patch[k] as string | undefined);
    }
    setSp(next, { replace: true });

    // guarda o recorte inteiro (não só period) -- só serve de fallback pra aba nova/
    // sessão nova sem querystring; navegação normal já persiste via NavLink+search.
    const merged: Partial<Filters> = { ...f, ...patch };
    for (const k of Object.keys(merged) as (keyof Filters)[]) {
      if (!merged[k]) delete merged[k];
    }
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
    project: f.project,
  };
};

/** Params para os endpoints mês-âncora (recorte, sem janela). */
export const scopeParams = (f: Filters): Record<string, string | undefined> => ({
  service: f.service,
  environment: f.environment,
  app: f.app,
  project: f.project,
});

export const hasActiveFilters = (f: Filters): boolean =>
  f.period !== "mes" || !!f.service || !!f.environment || !!f.app || !!f.project;
