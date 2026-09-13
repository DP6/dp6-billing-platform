import { DataTable, LoadingOrError, MetricGrid, MetricTile, PageHeader, Panel } from "../components/ui";
import { useApi } from "../lib/api";
import { brl, dayLabel, pct } from "../lib/format";
import { filterParams, useFilters } from "../lib/useFilters";
import type { AnomalyRow } from "../types";

export function Anomalias() {
  const [f] = useFilters();
  const anomalies = useApi<AnomalyRow[]>("/anomalies", filterParams(f));

  const rows = anomalies.data ?? [];
  const thisMonth = rows.filter((r) => r.usage_date.slice(0, 7) === new Date().toISOString().slice(0, 7));
  const impact = rows.reduce((s, r) => s + r.deviation_abs_brl, 0);

  return (
    <>
      <PageHeader eyebrow="Dias fora do padrão" title="Anomalias" desc="Dias sinalizados por z-score > 3 e desvio > R$ 1, contra a média móvel de 28 dias." />

      <LoadingOrError loading={anomalies.loading} error={anomalies.error} />
      <MetricGrid cols={4}>
        <MetricTile label="Sinalizadas" value={String(rows.length)} />
        <MetricTile label="No mês" value={String(thisMonth.length)} />
        <MetricTile label="Impacto acima da média" value={brl(impact)} sub="soma dos desvios" />
        <MetricTile label="Regra ativa" value="z > 3 · > R$ 1" sub="janela 28 dias" />
      </MetricGrid>

      <Panel title="Ocorrências" cap="Uma linha por dia sinalizado.">
        {rows.length === 0 && !anomalies.loading ? (
          <p style={{ color: "var(--ink-dim)", fontSize: 13 }}>Nenhuma anomalia no recorte atual.</p>
        ) : (
          <DataTable
            rows={rows}
            search={(r) => r.service_description}
            cols={[
              { key: "d", label: "Data", render: (r: AnomalyRow) => <span className="mono">{dayLabel(r.usage_date)}</span>, sort: (r) => r.usage_date },
              { key: "s", label: "Serviço · valor do dia", render: (r: AnomalyRow) => `${r.service_description} · ${brl(r.net_cost_brl)}`, sort: (r) => r.service_description },
              { key: "z", label: "z", num: true, render: (r: AnomalyRow) => <span className="mono">{r.z_score.toFixed(1)}</span>, sort: (r) => r.z_score },
              {
                key: "dev",
                label: "Média 28d · desvio",
                render: (r: AnomalyRow) => (
                  <>
                    {brl(r.avg_28d_brl)} · <strong style={{ color: "var(--status-error-foreground)" }}>+{brl(r.deviation_abs_brl)} ({pct(r.deviation_pct)})</strong>
                  </>
                ),
                sort: (r) => r.deviation_abs_brl,
              },
            ]}
          />
        )}
      </Panel>
    </>
  );
}
