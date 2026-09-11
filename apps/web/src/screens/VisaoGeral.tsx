import { useState } from "react";
import { AreaTrend } from "../charts/AreaTrend";
import { HBars } from "../charts/HBars";
import { type Grain, type GroupBy, TemporalChart } from "../charts/TemporalChart";
import {
  DataTable,
  LoadingOrError,
  MetricGrid,
  MetricTile,
  PageHeader,
  Panel,
  StatusBadge,
} from "../components/ui";
import { useApi } from "../lib/api";
import { brl, monthLabel, monthLong, pct, pctPlain, relativeToNow, usd } from "../lib/format";
import { filterParams, resolveWindow, scopeParams, useFilters } from "../lib/useFilters";
import type {
  AppAllocation,
  Budget,
  BurndownPoint,
  CostSeriesPoint,
  Dimensions,
  EnvAllocation,
  ForecastMonth,
  ReconRow,
  Scorecard,
  ServiceCost,
} from "../types";

const brDate = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

const groupEyebrow = {
  font: "500 10px/1 Ubuntu, sans-serif",
  letterSpacing: ".18em",
  textTransform: "uppercase" as const,
  color: "var(--muted-foreground)",
  marginBottom: 8,
  display: "block",
};

function AllocBars({
  title,
  rows,
  unallocated,
}: {
  title: string;
  rows: { label: string; value: number }[];
  unallocated: number;
}) {
  const all = [...rows, { label: "(não-alocado)", value: unallocated }];
  return (
    <div>
      <span style={groupEyebrow}>{title}</span>
      <HBars rows={all.map((r) => ({ label: r.label, value: r.value }))} />
    </div>
  );
}

export function VisaoGeral() {
  const [f] = useFilters();
  const win = resolveWindow(f);
  const janela = `${brDate(win.from)} a ${brDate(win.to)}`;

  const [series, setSeries] = useState<{ grain: Grain; groupBy: GroupBy }>({ grain: "day", groupBy: "none" });

  const dims = useApi<Dimensions>("/dimensions");
  const sc = useApi<Scorecard>("/scorecard", filterParams(f));
  const svc = useApi<ServiceCost[]>("/cost/by-service", filterParams(f));
  const recon = useApi<ReconRow[]>("/reconciliation", scopeParams(f));
  const budget = useApi<Budget>("/budget", scopeParams(f));
  const burndown = useApi<BurndownPoint[]>("/budget/burndown", { currency: f.currency });
  const forecast = useApi<ForecastMonth[]>("/forecast", { horizon: "3", currency: f.currency });
  const cseries = useApi<CostSeriesPoint[]>("/cost/series", {
    ...filterParams(f),
    grain: series.grain,
    group_by: series.groupBy,
  });
  const byApp = useApi<AppAllocation>("/allocation/by-app", scopeParams(f));
  const byEnv = useApi<EnvAllocation>("/allocation/by-env", scopeParams(f));

  const s = sc.data;
  const d = dims.data;
  const nowIso = new Date().toISOString();
  const stale = d?.data_updated_at && Date.now() - new Date(d.data_updated_at).getTime() > 36 * 3600 * 1000;

  return (
    <>
      <PageHeader
        eyebrow={
          s ? `${monthLong(s.invoice_month)} · mês corrente (MTD, ${s.days_elapsed} dias)` : "Mês corrente"
        }
        title="Visão geral"
        desc={
          <>
            Custo faturado do projeto <span className="mono">dp6-ci-polaris</span> a partir do billing export.
            Fatura em BRL; USD pela taxa da linha.
          </>
        }
      />

      {/* tira de saúde dos dados */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "9px 14px",
          background: "var(--muted)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          fontSize: 12.5,
          color: "var(--muted-foreground)",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            flex: "none",
            background: stale ? "var(--status-warn)" : "var(--status-ok)",
          }}
        />
        {d ? (
          <>
            {d.export_ok ? "Export íntegro" : "Export com pendência"} · última carga{" "}
            <span className="mono">{relativeToNow(d.data_updated_at || nowIso)}</span> ·{" "}
            <span className="mono">{d.source_rows.toLocaleString("pt-BR")}</span> linhas ·{" "}
            <span className="mono">{d.invoice_months.length}</span> meses
          </>
        ) : (
          "carregando saúde dos dados…"
        )}
      </div>

      {/* Scorecard dividido: esquerda não segue o Período; direita segue */}
      <LoadingOrError loading={sc.loading} error={sc.error} />
      {s && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1.9fr)",
            gap: 24,
            alignItems: "start",
          }}
        >
          <div style={{ borderRight: "1px solid var(--border)", paddingRight: 24 }}>
            <span style={groupEyebrow}>Mês corrente · fixo</span>
            <MetricGrid cols={2}>
              <MetricTile
                label="Custo vs. orçamento"
                value={pctPlain(s.budget_used_pct)}
                sub={
                  <>
                    de <span className="mono">{brl(s.budget_brl)}</span> · run-rate{" "}
                    {pctPlain(s.run_rate_vs_budget_pct)}
                    <br />
                    <StatusBadge tone={s.run_rate_vs_budget_pct <= 1 ? "ok" : "warn"}>
                      {s.run_rate_vs_budget_pct <= 1 ? "dentro do orçamento" : "acima no ritmo atual"}
                    </StatusBadge>
                  </>
                }
              />
              <MetricTile
                label="Run-rate fim de mês"
                value={brl(s.run_rate_eom_brl)}
                sub={`projeção linear · ${s.days_elapsed} de ${s.days_in_month} dias`}
              />
            </MetricGrid>
          </div>

          <div>
            <span style={groupEyebrow}>Período · {janela}</span>
            <MetricGrid cols={4}>
              <MetricTile
                label="Custo líquido"
                value={f.currency === "USD" ? usd(s.net_cost_mtd_usd) : brl(s.net_cost_mtd_brl)}
                sub={
                  <span className="mono">
                    {f.currency === "USD" ? brl(s.net_cost_mtd_brl) : usd(s.net_cost_mtd_usd)}
                  </span>
                }
              />
              <MetricTile
                label="Δ vs. período anterior"
                value={pct(s.mom_pct)}
                tone={s.mom_pct <= 0 ? "ok" : "bad"}
                sub={
                  <>
                    anterior <span className="mono">{brl(s.prev_month_net_brl)}</span>
                  </>
                }
              />
              <MetricTile
                label="Créditos"
                value={brl(s.credits_mtd_brl)}
                sub="créditos aplicados no período"
              />
              <MetricTile
                label="Economia efetiva"
                value={pctPlain(s.effective_savings_pct)}
                sub="1 − líquido / bruto (só créditos)"
              />
            </MetricGrid>
          </div>
        </div>
      )}

      {/* mês-âncora antes dos widgets de janela */}
      <Panel
        title="Reconciliação com a fatura"
        cap="net = custo bruto + créditos. Cada mês confere com o relatório de faturamento do console."
      >
        <LoadingOrError loading={recon.loading} error={recon.error} />
        {recon.data && (
          <DataTable
            rows={recon.data}
            cols={[
              {
                key: "m",
                label: "Mês da fatura",
                render: (r: ReconRow, i: number) => (
                  <span className="mono">
                    {monthLabel(r.invoice_month)}
                    {i === recon.data!.length - 1 && (
                      <span style={{ color: "var(--ink-mute)" }}> (parcial)</span>
                    )}
                  </span>
                ),
              },
              { key: "g", label: "Custo bruto", num: true, render: (r: ReconRow) => brl(r.gross_cost_brl) },
              { key: "c", label: "Créditos", num: true, render: (r: ReconRow) => brl(r.credits_total_brl) },
              {
                key: "n",
                label: "Líquido",
                num: true,
                render: (r: ReconRow) => <strong>{brl(r.net_cost_brl)}</strong>,
              },
              {
                key: "ok",
                label: "Confere",
                render: (r: ReconRow) => (
                  <StatusBadge tone={r.matches_invoice ? "ok" : "error"}>
                    {r.matches_invoice ? "confere" : "diverge"}
                  </StatusBadge>
                ),
              },
            ]}
          />
        )}
      </Panel>

      {/* Orçamento & previsão (mês-âncora) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span className="eyebrow">Orçamento do mês · {brl(budget.data?.budget_brl ?? 20)}</span>
        <h2 style={{ fontSize: 18 }}>Orçamento &amp; previsão</h2>
      </div>
      <LoadingOrError loading={budget.loading} error={budget.error} />
      {budget.data && (
        <MetricGrid cols={3}>
          <MetricTile
            label="Consumido · MTD"
            value={brl(budget.data.net_cost_mtd_brl)}
            sub={pctPlain(budget.data.budget_used_pct)}
          />
          <MetricTile
            label="Folga projetada"
            value={brl(budget.data.headroom_brl)}
            tone={budget.data.headroom_brl >= 0 ? "ok" : "bad"}
            sub="orçamento − projeção linear"
          />
          <MetricTile
            label="Estouro projetado"
            value={budget.data.projected_breach_date ?? "sem estouro"}
            sub="no ritmo atual"
          />
        </MetricGrid>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 16 }}>
        <Panel
          title="Consumo acumulado vs. orçamento"
          cap="Linha = realizado · tracejada = orçamento. Thresholds 50/80/100/120% no gráfico completo (PR B)."
        >
          <LoadingOrError loading={burndown.loading} error={burndown.error} />
          {burndown.data && burndown.data.length > 0 && (
            <AreaTrend
              data={burndown.data.map((p) => ({
                label: brDate(p.usage_date),
                value: p.net_cost_cum_brl,
                ma7: p.budget_brl,
              }))}
            />
          )}
        </Panel>

        <Panel
          title="Previsão — próximos 3 meses"
          cap="Tendência estimada + faixa (histórico curto → incerteza alta)."
        >
          <LoadingOrError loading={forecast.loading} error={forecast.error} />
          {forecast.data && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
              {forecast.data.map((mo) => (
                <div key={mo.invoice_month} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    className="mono"
                    style={{ flex: "0 0 58px", fontSize: 12, color: "var(--muted-foreground)" }}
                  >
                    {monthLabel(mo.invoice_month)}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      height: 12,
                      background: "var(--muted)",
                      borderRadius: 3,
                      overflow: "hidden",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        height: "100%",
                        width: `${Math.min((mo.value_brl / 24) * 100, 100)}%`,
                        background: mo.is_actual ? "var(--chart-net)" : "var(--chart-other)",
                      }}
                    />
                  </span>
                  <span className="mono" style={{ flex: "0 0 130px", textAlign: "right", fontSize: 12 }}>
                    {brl(mo.value_brl)}
                    {mo.forecast_lo_brl != null && mo.forecast_hi_brl != null && (
                      <span style={{ color: "var(--ink-mute)" }}>
                        {" "}
                        ({brl(mo.forecast_lo_brl)}–{brl(mo.forecast_hi_brl)})
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* widgets de janela */}
      <Panel
        title="Custo líquido no tempo"
        cap={`Barras = custo do período · linha = acumulado (eixo à direita) · tracejada = média móvel 7 dias · ${janela}.`}
      >
        <LoadingOrError loading={cseries.loading} error={cseries.error} />
        <TemporalChart
          data={cseries.data}
          grain={series.grain}
          groupBy={series.groupBy}
          onChange={setSeries}
        />
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Panel title="Custo por serviço" cap={`Acumulado · ${janela}.`}>
          <LoadingOrError loading={svc.loading} error={svc.error} />
          {svc.data &&
            (svc.data.length === 0 ? (
              <p style={{ color: "var(--ink-mute)", fontSize: 13 }}>Sem custo no período/recorte.</p>
            ) : (
              <HBars
                rows={svc.data.map((r) => ({
                  label: r.service_description,
                  value: r.net_cost_brl,
                  pct: r.pct_of_total,
                }))}
              />
            ))}
        </Panel>

        <Panel
          title="Custo por app e ambiente"
          cap="Só a fração do custo com a label preenchida (hoje ~10%). Detalhe na aba Alocação."
        >
          <LoadingOrError loading={byApp.loading || byEnv.loading} error={byApp.error || byEnv.error} />
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {byApp.data && (
              <AllocBars
                title="por app"
                rows={byApp.data.rows.map((r) => ({ label: r.label_app, value: r.net_cost_brl }))}
                unallocated={byApp.data.unallocated_net_cost_brl}
              />
            )}
            {byEnv.data && (
              <AllocBars
                title="por ambiente"
                rows={byEnv.data.rows.map((r) => ({ label: r.label_environment, value: r.net_cost_brl }))}
                unallocated={byEnv.data.unallocated_net_cost_brl}
              />
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}
