import { AreaTrend } from "../charts/AreaTrend";
import { Waterfall } from "../charts/Waterfall";
import { DataTable, LoadingOrError, MetricGrid, MetricTile, PageHeader, Panel } from "../components/ui";
import { useApi } from "../lib/api";
import { brl, brlPrecise, dayLabel } from "../lib/format";
import { resolveWindow, useFilters } from "../lib/useFilters";
import type { UnitEconomics, UnitSeriesPoint, WaterfallStep } from "../types";

/**
 * Fusão de Otimização & waste + Unit economics & eficiência (specs/005-telas.md §5,
 * docs/adr/ADR-009-ia-6-abas.md). "Custo por deploy" (denominador config/chutado),
 * "Recomendações" (curadoria manual sem relação com dado ao vivo) e "Cobertura de
 * compromissos"/CUD-SUD (não fazia sentido pro tamanho desta conta) foram removidos a
 * pedido — ver histórico do PR se precisar recuperar.
 */
export function Eficiencia() {
  const [f] = useFilters();
  const win = resolveWindow(f);

  const unit = useApi<UnitEconomics>("/unit-economics");
  const waterfall = useApi<WaterfallStep[]>("/efficiency/waterfall");
  const series = useApi<UnitSeriesPoint[]>("/unit-economics/series", { metric: "cost_per_1k_req", from: win.from, to: win.to });

  // `_cost_avoided_brl` é uma linha "meta" que efficiency_waterfall devolve junto dos degraus
  // (desconto negociado + créditos, já calculado em rpt_savings_waterfall) — não é derivado
  // aqui no front. shape() do Waterfall.tsx ignora essa linha ao desenhar os degraus.
  const costAvoided = waterfall.data?.find((s) => s.label === "_cost_avoided_brl")?.value_brl;
  const waterfallSteps = waterfall.data?.filter((s) => s.kind !== "meta");

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
          <MetricTile
            label="Custo por 1k requests"
            value={brlPrecise(unit.data.cost_per_1k_req_brl)}
            sub={unit.data.cost_per_1k_req_brl === 0 ? "0 = dentro do free tier (2M req/mês)" : undefined}
          />
          <MetricTile label="Custo por GB de log" value={brlPrecise(unit.data.cost_per_gib_log_brl)} sub="free tier" />
          <MetricTile label="Custo médio por dia" value={brl(unit.data.cost_per_day_avg_30d_brl)} sub="média móvel 30d" />
          <MetricTile
            label="Custo evitado (acumulado)"
            value={costAvoided != null ? brl(costAvoided) : "—"}
            sub="desconto negociado + créditos"
          />
        </MetricGrid>
      )}

      <Panel title="Do preço de tabela ao custo real" cap="cost_at_list → descontos → créditos → net_cost.">
        <LoadingOrError loading={waterfall.loading} error={waterfall.error} />
        {waterfallSteps && waterfallSteps.length > 0 && <Waterfall steps={waterfallSteps} />}
      </Panel>

      {unit.data && (
        <Panel title="Eficiência do Cloud Run">
          <DataTable
            rows={[
              { label: "Custo por vCPU·s", value: brlPrecise(unit.data.cost_per_vcpu_s_brl) },
              { label: "Custo por GiB·s", value: brlPrecise(unit.data.cost_per_gib_s_brl) },
              { label: "Razão CPU:memória", value: unit.data.cpu_mem_ratio },
            ]}
            cols={[
              { key: "l", label: "Métrica", render: (r) => r.label },
              { key: "v", label: "Valor", num: true, render: (r) => <span className="mono">{r.value}</span> },
            ]}
          />
        </Panel>
      )}

      <Panel
        title="Custo por request · por dia"
        cap={`~${unit.data ? brlPrecise(unit.data.cost_per_1k_req_brl) : "—"} a cada 1k requests — valor sub-centavo (por isso o eixo usa mais casas decimais); um trecho em R$ 0,00 é esperado quando o volume do dia fica dentro do free tier do Cloud Run.`}
      >
        <LoadingOrError loading={series.loading} error={series.error} />
        {series.data && series.data.length > 0 && (
          <AreaTrend
            data={series.data.map((p) => ({ label: dayLabel(p.usage_date), value: p.value_brl }))}
            formatValue={brlPrecise}
          />
        )}
      </Panel>
    </>
  );
}
