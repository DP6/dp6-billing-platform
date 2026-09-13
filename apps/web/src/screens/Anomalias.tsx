import { useEffect, useState } from "react";
import { DataTable, LoadingOrError, MetricGrid, MetricTile, PageHeader, Panel } from "../components/ui";
import { useApi } from "../lib/api";
import { brl, dayLabel, pct } from "../lib/format";
import { filterParams, useFilters } from "../lib/useFilters";
import type { AnomalyRow } from "../types";

const DISMISS_KEY = "pcm:anomaly-dismissed";
const rowId = (r: AnomalyRow) => `${r.usage_date}|${r.service_description}`;

function readDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function Anomalias() {
  const [f] = useFilters();
  const anomalies = useApi<AnomalyRow[]>("/anomalies", filterParams(f));
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed());

  useEffect(() => {
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify([...dismissed]));
    } catch {
      /* modo privado */
    }
  }, [dismissed]);

  const all = anomalies.data ?? [];
  const open = all.filter((r) => !dismissed.has(rowId(r)));
  const thisMonth = open.filter((r) => r.usage_date.slice(0, 7) === new Date().toISOString().slice(0, 7));
  const impact = open.reduce((s, r) => s + r.deviation_abs_brl, 0);

  const dismiss = (r: AnomalyRow) => setDismissed((prev) => new Set(prev).add(rowId(r)));

  return (
    <>
      <PageHeader eyebrow="Dias fora do padrão" title="Anomalias" desc="Dias sinalizados por z-score > 3 e desvio > R$ 1, contra a média móvel de 28 dias." />

      <LoadingOrError loading={anomalies.loading} error={anomalies.error} />
      <MetricGrid cols={4}>
        <MetricTile label="Em aberto" value={String(open.length)} sub="sem baixa" />
        <MetricTile label="No mês" value={String(thisMonth.length)} />
        <MetricTile label="Impacto acima da média" value={brl(impact)} sub="soma dos desvios em aberto" />
        <MetricTile label="Regra ativa" value="z > 3 · > R$ 1" sub="janela 28 dias" />
      </MetricGrid>

      <Panel title="Ocorrências" cap={'Uma linha por dia sinalizado · "Dar baixa" só esconde a linha neste navegador (localStorage) — não avisa ninguém, não apaga o dado, some se limpar o navegador.'}>
        {open.length === 0 && !anomalies.loading ? (
          <p style={{ color: "var(--ink-dim)", fontSize: 13 }}>Nenhuma anomalia em aberto no recorte atual.</p>
        ) : (
          <DataTable
            rows={open}
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
              {
                key: "a",
                label: "",
                render: (r: AnomalyRow) => (
                  <button
                    type="button"
                    onClick={() => dismiss(r)}
                    title="Só marca como visto neste navegador (localStorage) — não persiste no servidor, não é visto por outras pessoas nem em outro dispositivo."
                    style={{
                      padding: "4px 10px",
                      fontSize: 12,
                      background: "transparent",
                      border: "1px solid var(--border-strong)",
                      borderRadius: "var(--radius)",
                      color: "var(--ink-dim)",
                      cursor: "pointer",
                    }}
                  >
                    Dar baixa
                  </button>
                ),
              },
            ]}
          />
        )}
      </Panel>
    </>
  );
}
