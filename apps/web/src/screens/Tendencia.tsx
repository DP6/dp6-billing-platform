import { MomBars, type MomBarPoint } from "../charts/MomBars";
import { PaceChart, type PacePoint } from "../charts/PaceChart";
import { TemporalChart } from "../charts/TemporalChart";
import { LoadingOrError, PageHeader, Panel } from "../components/ui";
import { useApi } from "../lib/api";
import { monthLabel } from "../lib/format";
import { scopeParams, useFilters } from "../lib/useFilters";
import type { CostSeriesPoint, DailyPoint, MonthlyServicePoint, ReconRow, Scorecard } from "../types";

/** `MonthlyServicePointDTO[]` (longo, por serviço) → formato que o `TemporalChart` consome. */
function monthlySeries(rows: MonthlyServicePoint[] | undefined): CostSeriesPoint[] {
  return (rows ?? []).map((r) => ({ period: r.invoice_month, key: r.service_description, net_cost_brl: r.net_cost_brl }));
}

/** `/reconciliation` já é 1 linha por invoice_month — Δ MoM é calculado aqui (a view não
 *  expõe total-mês com LAG, só por serviço); a barra fantasma usa o run-rate do mês aberto. */
function momData(recon: ReconRow[] | undefined, sc: Scorecard | undefined): MomBarPoint[] {
  if (!recon) return [];
  const sorted = [...recon].sort((a, b) => a.invoice_month.localeCompare(b.invoice_month));
  return sorted.map((r, i) => {
    const prev = sorted[i - 1];
    const mom_pct = prev && prev.net_cost_brl ? (r.net_cost_brl - prev.net_cost_brl) / prev.net_cost_brl : null;
    const isOpenMonth = sc?.invoice_month === r.invoice_month;
    return {
      label: monthLabel(r.invoice_month),
      net_cost_brl: r.net_cost_brl,
      mom_pct,
      ghost_brl: isOpenMonth ? sc?.run_rate_eom_brl : undefined,
    };
  });
}

/** Acumulado dia-a-dia do mês corrente vs. mês anterior, alinhado por dia-do-mês —
 *  janela própria (não é o Período global do FilterBar, specs/005-telas.md §2). */
function paceData(daily: DailyPoint[] | undefined): PacePoint[] {
  if (!daily) return [];
  const byMonth = new Map<string, { day: number; v: number }[]>();
  for (const p of daily) {
    const key = p.usage_date.slice(0, 7);
    const arr = byMonth.get(key) ?? [];
    arr.push({ day: Number(p.usage_date.slice(8, 10)), v: p.net_cost_brl });
    byMonth.set(key, arr);
  }
  const months = [...byMonth.keys()].sort();
  const cumulate = (key: string | undefined) => {
    const arr = [...(key ? byMonth.get(key) ?? [] : [])].sort((a, b) => a.day - b.day);
    const map = new Map<number, number>();
    let cum = 0;
    for (const { day, v } of arr) {
      cum += v;
      map.set(day, cum);
    }
    return map;
  };
  const curMap = cumulate(months[months.length - 1]);
  const prevMap = cumulate(months[months.length - 2]);
  const maxDay = Math.max(0, ...curMap.keys(), ...prevMap.keys());
  return Array.from({ length: maxDay }, (_, i) => {
    const day = i + 1;
    return { day, current: curMap.get(day), previous: prevMap.get(day) };
  });
}

export function Tendencia() {
  const [f] = useFilters();
  const scope = scopeParams(f);

  const sc = useApi<Scorecard>("/scorecard", scope);
  const monthly = useApi<MonthlyServicePoint[]>("/cost/monthly", { environment: f.environment, app: f.app });
  const recon = useApi<ReconRow[]>("/reconciliation", scope);

  // janela própria da tela: início do mês anterior até hoje (não o Período global).
  const today = new Date();
  const prevMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const daily = useApi<DailyPoint[]>("/cost/daily", {
    ...scope,
    from: prevMonthStart.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
  });

  return (
    <>
      <PageHeader
        eyebrow="Evolução mês a mês"
        title="Tendência"
        desc="Empilhado mensal por serviço, variação mês a mês com run-rate, ritmo acumulado do mês corrente vs. anterior."
      />

      <Panel title="Custo líquido mensal por serviço" cap="Empilhado por invoice_month · ≤5 serviços + Outros.">
        <LoadingOrError loading={monthly.loading} error={monthly.error} />
        <TemporalChart
          data={monthlySeries(monthly.data)}
          grain="month"
          groupBy="service"
          onChange={() => {}}
          controls={false}
        />
      </Panel>

      <Panel
        title="Variação mês a mês"
        cap="Rótulo = Δ MoM · barra tracejada = run-rate projetado do mês aberto."
      >
        <LoadingOrError loading={recon.loading || sc.loading} error={recon.error || sc.error} />
        <MomBars data={momData(recon.data, sc.data)} />
      </Panel>

      <Panel
        title="Ritmo acumulado"
        cap="Acumulado dia a dia · mês corrente (sólida) vs. mês anterior no mesmo dia (cinza)."
      >
        <LoadingOrError loading={daily.loading} error={daily.error} />
        <PaceChart data={paceData(daily.data)} />
      </Panel>
    </>
  );
}
