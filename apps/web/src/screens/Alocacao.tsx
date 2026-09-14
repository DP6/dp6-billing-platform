import { HBars } from "../charts/HBars";
import { PercentLines } from "../charts/PercentLines";
import { Chip, DataTable, LoadingOrError, MetricGrid, MetricTile, PageHeader, Panel, StatusBadge } from "../components/ui";
import { useApi } from "../lib/api";
import { brl, pctPlain, dayLabel } from "../lib/format";
import { chartColor } from "../charts/palette";
import { filterParams, resolveWindow, scopeParams, useFilters } from "../lib/useFilters";
import type { AppAllocation, ChargebackReadiness, ComponentLabelCoverage, CoverageWeek, EnvAllocation, UnlabeledResource } from "../types";

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

/** Alocado vs. não-alocado no período — 3 números + 1 barra de 2 segmentos proporcional. */
function AllocSummary({ total, unallocated }: { total: number; unallocated: number }) {
  const allocated = Math.max(0, total - unallocated);
  const pctAlloc = total ? allocated / total : 0;
  const pctUn = total ? unallocated / total : 0;
  return (
    <div>
      <MetricGrid cols={3}>
        <MetricTile label="Custo total" value={brl(total)} />
        <MetricTile label="Custo alocado" value={brl(allocated)} tone="ok" sub={pctPlain(pctAlloc)} />
        <MetricTile label="Custo não-alocado" value={brl(unallocated)} tone="bad" sub={pctPlain(pctUn)} />
      </MetricGrid>
      <div
        style={{
          display: "flex",
          height: 16,
          borderRadius: 4,
          overflow: "hidden",
          marginTop: 12,
          background: "var(--well)",
        }}
      >
        <span
          style={{ display: "block", width: `${Math.max(pctAlloc * 100, allocated ? 0.6 : 0)}%`, background: chartColor("net") }}
          title={`Alocado · ${brl(allocated)}`}
        />
        <span
          style={{ display: "block", width: `${Math.max(pctUn * 100, unallocated ? 0.6 : 0)}%`, background: chartColor("other") }}
          title={`Não-alocado · ${brl(unallocated)}`}
        />
      </div>
    </div>
  );
}

const statusTone = { ok: "ok", partial: "warn", missing: "error" } as const;

export function Alocacao() {
  const [f] = useFilters();
  const scope = scopeParams(f);
  const win = resolveWindow(f);

  const coverageByComponent = useApi<ComponentLabelCoverage[]>("/allocation/coverage/by-component");
  const unlabeled = useApi<UnlabeledResource[]>("/allocation/coverage/unlabeled-resources");
  const weekly = useApi<CoverageWeek[]>("/allocation/coverage/weekly", scope);
  // by-app/by-env agora respeitam Período + Serviço/Ambiente/Projeto do FilterBar — leem
  // fct_billing_cost_daily por usage_date, não mais um agregado mensal fixo.
  const byApp = useApi<AppAllocation>("/allocation/by-app", filterParams(f));
  const byEnv = useApi<EnvAllocation>("/allocation/by-env", filterParams(f));
  const chargeback = useApi<ChargebackReadiness>("/allocation/chargeback-readiness");

  const janela = `${dayLabel(win.from)} a ${dayLabel(win.to)}`;

  return (
    <>
      <PageHeader
        eyebrow="Rateio por app / ambiente"
        title="Alocação · showback"
        desc="Cobertura de label, custo alocado por app/ambiente, prontidão de chargeback."
      />

      <Panel
        title="Cobertura de label · por componente"
        cap='% de RECURSOS distintos (não de custo) com cada label aplicado no export, nos últimos 30 dias — independe de quanto cada recurso custou ou rodou no período, só olha se o label está lá. Conta inteira. Só entram componentes onde isso é mensurável (Cloud Run, Secret Manager); BigQuery fica de fora — job de BigQuery é uma execução, não um recurso rotulável.'
      >
        <LoadingOrError loading={coverageByComponent.loading} error={coverageByComponent.error} />
        {coverageByComponent.data && coverageByComponent.data.length > 0 && (
          <DataTable
            rows={coverageByComponent.data}
            cols={[
              {
                key: "c",
                label: "Componente",
                render: (r: ComponentLabelCoverage) => <strong>{r.service_description}</strong>,
                sort: (r) => r.service_description,
              },
              { key: "n", label: "Recursos", num: true, render: (r: ComponentLabelCoverage) => <span className="mono">{r.resources_total}</span>, sort: (r) => r.resources_total },
              { key: "mb", label: "% managed-by", num: true, render: (r: ComponentLabelCoverage) => pctPlain(r.pct_managed_by), sort: (r) => r.pct_managed_by },
              { key: "app", label: "% app", num: true, render: (r: ComponentLabelCoverage) => pctPlain(r.pct_app), sort: (r) => r.pct_app },
              { key: "env", label: "% ambiente", num: true, render: (r: ComponentLabelCoverage) => pctPlain(r.pct_environment), sort: (r) => r.pct_environment },
            ]}
          />
        )}
      </Panel>

      <Panel
        title="Recursos sem label"
        cap="Detalhamento acionável do painel acima — 1 linha por recurso com pelo menos 1 label faltando no export, ordenado por custo. Corrige-se na origem (Terraform/gcloud do recurso), não no billing."
      >
        <LoadingOrError loading={unlabeled.loading} error={unlabeled.error} />
        {unlabeled.data && unlabeled.data.length > 0 && (
          <DataTable
            rows={unlabeled.data}
            search={(r) => `${r.service_description} ${r.resource_name}`}
            cols={[
              { key: "svc", label: "Serviço", render: (r: UnlabeledResource) => r.service_description, sort: (r) => r.service_description },
              { key: "res", label: "Recurso", render: (r: UnlabeledResource) => <span className="mono">{r.resource_name}</span>, sort: (r) => r.resource_name },
              {
                key: "miss",
                label: "Faltando",
                render: (r: UnlabeledResource) => (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {r.missing_app && <Chip tone="bad">app</Chip>}
                    {r.missing_environment && <Chip tone="bad">environment</Chip>}
                    {r.missing_managed_by && <Chip tone="bad">managed-by</Chip>}
                  </div>
                ),
              },
              { key: "cost", label: "Custo (30d)", num: true, render: (r: UnlabeledResource) => <strong>{brl(r.net_cost_brl)}</strong>, sort: (r) => r.net_cost_brl },
            ]}
          />
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

      <Panel title="Alocado vs. não-alocado (por app)" cap={`No período filtrado · ${janela}. "Alocado" usa o label nativo quando existe e, quando não existe, reconstrói o dono pelo nome do recurso (Cloud Run, Secret Manager) ou pelo tipo de job (BigQuery) — por isso é maior que a Cobertura de label acima, de propósito.`}>
        <LoadingOrError loading={byApp.loading} error={byApp.error} />
        {byApp.data && <AllocSummary total={byApp.data.net_cost_total_brl} unallocated={byApp.data.unallocated_net_cost_brl} />}
      </Panel>

      <Panel title="Prontidão de chargeback" cap="Critérios pra saber se dá pra usar o rateio como cobrança real, não só como referência interna.">
        <LoadingOrError loading={chargeback.loading} error={chargeback.error} />
        {chargeback.data && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span className="mono" style={{ fontSize: 20, fontWeight: 700 }}>{pctPlain(chargeback.data.coverage_pct)}</span>
              <StatusBadge tone={chargeback.data.ready ? "ok" : "error"}>{chargeback.data.ready ? "pronto" : "não pronto"}</StatusBadge>
              <Chip tone="ok">calculado ao vivo</Chip>
            </div>
            <DataTable
              rows={chargeback.data.criteria}
              cols={[
                { key: "l", label: "Critério", render: (c) => c.label },
                { key: "s", label: "Status", render: (c) => <StatusBadge tone={statusTone[c.status as keyof typeof statusTone]}>{c.status}</StatusBadge> },
                { key: "src", label: "", render: () => <Chip tone="warn">curado</Chip> },
              ]}
            />
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--ink-dim)" }}>
              Só o % e o badge acima são calculados a partir do dado real; os 3 critérios da
              lista são um checklist mantido à mão, não recalculado automaticamente.
            </p>
          </>
        )}
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Panel title="Custo alocado por app" cap={`Label nativo + reconciliado por recurso/job · ${janela}. Barras "(BigQuery · ...)" são custo de BigQuery sem label nativo, classificado pelo tipo de job — não é uma app de verdade, mas também não é anônimo.`}>
          <LoadingOrError loading={byApp.loading} error={byApp.error} />
          {byApp.data && (
            <AllocBars title="por app" rows={byApp.data.rows.map((r) => ({ label: r.label_app, value: r.net_cost_brl }))} unallocated={byApp.data.unallocated_net_cost_brl} />
          )}
        </Panel>
        <Panel title="Custo alocado por ambiente" cap={`Label nativo + reconciliado (só Cloud Run/Secret Manager — BigQuery não dá pra inferir ambiente pelo job) · ${janela}.`}>
          <LoadingOrError loading={byEnv.loading} error={byEnv.error} />
          {byEnv.data && (
            <AllocBars title="por ambiente" rows={byEnv.data.rows.map((r) => ({ label: r.label_environment, value: r.net_cost_brl }))} unallocated={byEnv.data.unallocated_net_cost_brl} />
          )}
        </Panel>
      </div>
    </>
  );
}
