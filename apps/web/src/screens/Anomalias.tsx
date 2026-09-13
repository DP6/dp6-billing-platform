import { useEffect, useState } from "react";
import { DataTable, LoadingOrError, MetricGrid, MetricTile, PageHeader, Panel, WarningCallout } from "../components/ui";
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

      <Panel title="Ocorrências" cap={'Uma linha por dia sinalizado · "Dar baixa" é só visual (localStorage), não persiste no servidor.'}>
        {open.length === 0 && !anomalies.loading ? (
          <p style={{ color: "var(--ink-dim)", fontSize: 13 }}>Nenhuma anomalia em aberto no recorte atual.</p>
        ) : (
          <DataTable
            rows={open}
            cols={[
              { key: "d", label: "Data", render: (r: AnomalyRow) => <span className="mono">{dayLabel(r.usage_date)}</span> },
              { key: "s", label: "Serviço · valor do dia", render: (r: AnomalyRow) => `${r.service_description} · ${brl(r.net_cost_brl)}` },
              { key: "z", label: "z", num: true, render: (r: AnomalyRow) => <span className="mono">{r.z_score.toFixed(1)}</span> },
              {
                key: "dev",
                label: "Média 28d · desvio",
                render: (r: AnomalyRow) => (
                  <>
                    {brl(r.avg_28d_brl)} · <strong style={{ color: "var(--status-error-foreground)" }}>+{brl(r.deviation_abs_brl)} ({pct(r.deviation_pct)})</strong>
                  </>
                ),
              },
              {
                key: "a",
                label: "",
                render: (r: AnomalyRow) => (
                  <button
                    type="button"
                    onClick={() => dismiss(r)}
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

      <WarningCallout>
        Verifique se as datas sinalizadas coincidem com uma janela conhecida de deploy/carga
        (ver aba Tendência) antes de tratar como incidente.
      </WarningCallout>
    </>
  );
}
