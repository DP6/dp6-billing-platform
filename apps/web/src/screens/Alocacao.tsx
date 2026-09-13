import { HBars } from "../charts/HBars";
import { PercentLines } from "../charts/PercentLines";
import { RingStat } from "../charts/RingStat";
import { DataTable, LoadingOrError, MetricTile, PageHeader, Panel, StatusBadge, WarningCallout } from "../components/ui";
import { useApi } from "../lib/api";
import { brl, pctPlain, monthLabel as ymLabel } from "../lib/format";
import { scopeParams, useFilters } from "../lib/useFilters";
import type { AppAllocation, ChargebackReadiness, CoverageWeek, EnvAllocation, LabelCoverage } from "../types";

const groupEyebrow = {
  font: "500 10px/1 Ubuntu, sans-serif",
  letterSpacing: ".18em",
  textTransform: "uppercase" as const,
  color: "var(--ink-dim)",
  marginBottom: 8,
  display: "block",
};

function AllocBars({ title, rows, unallocated }: { title: string; rows: { label: string; value: number }[]; unallocated: number }) {
  const all = [...rows, { label: "(não-alocado)", value: unallocated }];
  return (
    <div>
      <span style={groupEyebrow}>{title}</span>
      <HBars rows={all} />
    </div>
  );
}

const statusTone = { ok: "ok", partial: "warn", missing: "error" } as const;

export function Alocacao() {
  const [f] = useFilters();
  const scope = scopeParams(f);

  const coverage = useApi<LabelCoverage[]>("/allocation/coverage", { months: "1", project: f.project });
  const weekly = useApi<CoverageWeek[]>("/allocation/coverage/weekly", scope);
  const byApp = useApi<AppAllocation>("/allocation/by-app", scope);
  const byEnv = useApi<EnvAllocation>("/allocation/by-env", scope);
  const chargeback = useApi<ChargebackReadiness>("/allocation/chargeback-readiness");

  const cov = coverage.data?.[0];

  return (
    <>
      <PageHeader
        eyebrow="Rateio por app / ambiente"
        title="Alocação · showback"
        desc="Cobertura de label, custo alocado por app/ambiente, prontidão de chargeback."
      />

      <WarningCallout>
        Cobertura de label ainda é baixa. O rateio abaixo cobre só a fração já rotulada — não
        use para chargeback ainda.
      </WarningCallout>

      <Panel title="Cobertura de label · por custo" cap={cov ? `${ymLabel(cov.invoice_month)} · sobre ${brl(cov.net_cost_total_brl)} de custo líquido.` : undefined}>
        <LoadingOrError loading={coverage.loading} error={coverage.error} />
        {cov && (
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap", justifyContent: "space-around" }}>
            <RingStat pct={cov.pct_managed_by} label="managed-by" caption={brl(cov.net_cost_total_brl * cov.pct_managed_by)} />
            <RingStat pct={cov.pct_app} label="app" caption={brl(cov.net_cost_total_brl * cov.pct_app)} />
            <RingStat pct={cov.pct_environment} label="ambiente" caption={brl(cov.net_cost_total_brl * cov.pct_environment)} />
          </div>
        )}
      </Panel>

      <Panel title="Progressão da cobertura (por semana)" cap="Fração do custo líquido com cada chave preenchida.">
        <LoadingOrError loading={weekly.loading} error={weekly.error} />
        {weekly.data && weekly.data.length > 0 && (
          <PercentLines
            data={weekly.data.map((w) => ({ label: w.week_start.slice(5), pct_app: w.pct_app, pct_environment: w.pct_environment, pct_managed_by: w.pct_managed_by }))}
            series={[
              { key: "pct_managed_by", label: "managed-by", color: "net" },
              { key: "pct_app", label: "app", color: "alt" },
              { key: "pct_environment", label: "ambiente", color: "other" },
            ]}
          />
        )}
      </Panel>

      <LoadingOrError loading={byApp.loading} error={byApp.error} />
      {byApp.data && (
        <MetricTile
          label="Custo não-alocado"
          value={brl(byApp.data.unallocated_net_cost_brl)}
          tone="bad"
          sub={`${pctPlain(byApp.data.unallocated_pct)} do custo · sem app nem ambiente`}
        />
      )}

      <Panel title="Prontidão de chargeback" cap="Critérios para usar o rateio como cobrança real.">
        <LoadingOrError loading={chargeback.loading} error={chargeback.error} />
        {chargeback.data && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span className="mono" style={{ fontSize: 20, fontWeight: 700 }}>{pctPlain(chargeback.data.coverage_pct)}</span>
              <StatusBadge tone={chargeback.data.ready ? "ok" : "error"}>{chargeback.data.ready ? "pronto" : "não pronto"}</StatusBadge>
            </div>
            <DataTable
              rows={chargeback.data.criteria}
              cols={[
                { key: "l", label: "Critério", render: (c) => c.label },
                { key: "s", label: "Status", render: (c) => <StatusBadge tone={statusTone[c.status as keyof typeof statusTone]}>{c.status}</StatusBadge> },
              ]}
            />
          </>
        )}
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Panel title="Custo alocado por app" cap="Da fração com label app preenchida.">
          <LoadingOrError loading={byApp.loading} error={byApp.error} />
          {byApp.data && (
            <AllocBars title="por app" rows={byApp.data.rows.map((r) => ({ label: r.label_app, value: r.net_cost_brl }))} unallocated={byApp.data.unallocated_net_cost_brl} />
          )}
        </Panel>
        <Panel title="Custo alocado por ambiente" cap="Da fração com label environment preenchida.">
          <LoadingOrError loading={byEnv.loading} error={byEnv.error} />
          {byEnv.data && (
            <AllocBars title="por ambiente" rows={byEnv.data.rows.map((r) => ({ label: r.label_environment, value: r.net_cost_brl }))} unallocated={byEnv.data.unallocated_net_cost_brl} />
          )}
        </Panel>
      </div>
    </>
  );
}
