import { AreaTrend } from "../charts/AreaTrend";
import { RingStat } from "../charts/RingStat";
import { Waterfall } from "../charts/Waterfall";
import { Chip, DataTable, LoadingOrError, MetricGrid, MetricTile, PageHeader, Panel, WarningCallout } from "../components/ui";
import { useApi } from "../lib/api";
import { brl, dayLabel } from "../lib/format";
import { resolveWindow, useFilters } from "../lib/useFilters";
import type { CommitmentCoverage, Recommendations, UnitEconomics, UnitSeriesPoint, WaterfallStep } from "../types";

const effortTone = { baixo: "ok", médio: "warn", alto: "bad" } as const;

/**
 * Fusão de Otimização & waste + Unit economics & eficiência (specs/005-telas.md §5,
 * docs/adr/ADR-009-ia-6-abas.md). `deploy_count` e recomendações são config/curado — marcados
 * com `Chip "config"`, não medidos do billing export.
 */
export function Eficiencia() {
  const [f] = useFilters();
  const win = resolveWindow(f);

  const unit = useApi<UnitEconomics>("/unit-economics");
  const waterfall = useApi<WaterfallStep[]>("/efficiency/waterfall");
  const commitment = useApi<CommitmentCoverage>("/optimization/commitment-coverage");
  const series = useApi<UnitSeriesPoint[]>("/unit-economics/series", { metric: "cost_per_1k_req", from: win.from, to: win.to });
  const recs = useApi<Recommendations>("/optimization/recommendations");

  const costAvoided = commitment.data ? commitment.data.eligible_spend_brl * commitment.data.covered_pct : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Rate + workload optimization"
        title="Eficiência & economia"
        desc="A este volume o ganho é hábito e governança — as recomendações escalam com o projeto."
      />

      <LoadingOrError loading={unit.loading} error={unit.error} />
      {unit.data && (
        <MetricGrid cols={4}>
          <MetricTile label="Custo por deploy" value={brl(unit.data.cost_per_deploy_brl)} sub={<Chip tone="ok">config · {unit.data.deploy_count}/mês</Chip>} />
          <MetricTile label="Custo por 1k requests" value={brl(unit.data.cost_per_1k_req_brl)} />
          <MetricTile label="Custo por GB de log" value={brl(unit.data.cost_per_gib_log_brl)} sub="free tier" />
          <MetricTile label="Custo médio por dia" value={brl(unit.data.cost_per_day_avg_30d_brl)} sub="média móvel 30d" />
        </MetricGrid>
      )}

      <Panel title="Do preço de tabela ao custo real" cap="cost_at_list → descontos → créditos → net_cost.">
        <LoadingOrError loading={waterfall.loading} error={waterfall.error} />
        {waterfall.data && <Waterfall steps={waterfall.data} />}
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "center" }}>
        <MetricTile
          label="Custo evitado (acumulado)"
          value={costAvoided != null ? brl(costAvoided) : "—"}
          sub={<Chip tone="ok">derivado · eligible × cobertura</Chip>}
        />
        <Panel title="Cobertura de compromissos">
          <LoadingOrError loading={commitment.loading} error={commitment.error} />
          {commitment.data && (
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <RingStat pct={commitment.data.covered_pct} label="on-demand → committed" />
              {commitment.data.covered_pct === 0 && commitment.data.on_demand_spend_brl < commitment.data.cud_reeval_threshold_brl && (
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-dim)" }}>
                  CUD/SUD não compensa abaixo de ~{brl(commitment.data.cud_reeval_threshold_brl)}/mês estável.
                </p>
              )}
            </div>
          )}
        </Panel>
      </div>

      {unit.data && (
        <Panel title="Eficiência do Cloud Run">
          <DataTable
            rows={[
              { label: "Custo por vCPU·s", value: brl(unit.data.cost_per_vcpu_s_brl) },
              { label: "Custo por GiB·s", value: brl(unit.data.cost_per_gib_s_brl) },
              { label: "Razão CPU:memória", value: unit.data.cpu_mem_ratio },
            ]}
            cols={[
              { key: "l", label: "Métrica", render: (r) => r.label },
              { key: "v", label: "Valor", num: true, render: (r) => <span className="mono">{r.value}</span> },
            ]}
          />
        </Panel>
      )}

      <Panel title="Custo por request · por dia" cap={`Estável ~${unit.data ? brl(unit.data.cost_per_1k_req_brl) : "—"}/1k req — sem regressão.`}>
        <LoadingOrError loading={series.loading} error={series.error} />
        {series.data && series.data.length > 0 && (
          <AreaTrend data={series.data.map((p) => ({ label: dayLabel(p.usage_date), value: p.value_brl }))} />
        )}
      </Panel>

      <Panel title="Recomendações" cap={recs.data ? `Economia potencial: ${brl(recs.data.potential_savings_min_brl)}–${brl(recs.data.potential_savings_max_brl)}/mês.` : undefined}>
        <LoadingOrError loading={recs.loading} error={recs.error} />
        {recs.data && recs.data.items.length > 0 ? (
          <DataTable
            rows={recs.data.items}
            cols={[
              { key: "t", label: "Ação", render: (r) => r.title },
              { key: "e", label: "Evidência", render: (r) => r.evidence },
              { key: "s", label: "Economia est./mês", num: true, render: (r) => `${brl(r.savings_min_brl)}–${brl(r.savings_max_brl)}` },
              { key: "f", label: "Esforço", render: (r) => <Chip tone={effortTone[r.effort as keyof typeof effortTone] ?? "warn"}>{r.effort}</Chip> },
            ]}
          />
        ) : (
          !recs.loading && <WarningCallout tone="neutral">Nenhuma recomendação curada ainda.</WarningCallout>
        )}
      </Panel>
    </>
  );
}
