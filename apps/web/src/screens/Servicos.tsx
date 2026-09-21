import { HBars } from "../charts/HBars";
import { DataTable, DrillBar, LoadingOrError, PageHeader, Panel } from "../components/ui";
import { useAccess } from "../lib/access";
import { useApi } from "../lib/api";
import { brl, brlPrecise, dayLabel, num } from "../lib/format";
import { DRILL_LABEL, type DrillDimension, useDrillFilters } from "../lib/useDrillFilters";
import { filterParams, resolveWindow, useFilters } from "../lib/useFilters";
import type { MonthlyServicePoint, NewSku, SkuCost } from "../types";

interface Mover {
  service_description: string;
  prev: number;
  curr: number;
  delta: number;
}

/** Últimos 2 invoice_months presentes em `/cost/monthly`, delta por serviço (specs/005 §3). */
function topMovers(rows: MonthlyServicePoint[] | undefined): Mover[] {
  if (!rows || rows.length === 0) return [];
  const months = [...new Set(rows.map((r) => r.invoice_month))].sort();
  const [prevM, currM] = months.slice(-2);
  if (!currM) return [];
  const services = [...new Set(rows.map((r) => r.service_description))];
  const val = (m: string | undefined, s: string) => rows.find((r) => r.invoice_month === m && r.service_description === s)?.net_cost_brl ?? 0;
  return services
    .map((s) => {
      const prev = val(prevM, s);
      const curr = val(currM, s);
      return { service_description: s, prev, curr, delta: curr - prev };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

export function Servicos() {
  const { unrestricted } = useAccess();
  const [f] = useFilters();
  const { drill, toggle, clear } = useDrillFilters(f);
  const win = resolveWindow(f);

  // fp = filtros do topo (persistentes) + drill por clique (local da tela) -- mesclados
  // porque o clique deve refiltrar a página inteira.
  const fp = { ...filterParams(f), ...drill };

  const skuCost = useApi<SkuCost[]>("/cost/by-sku", fp);
  const newSkus = useApi<NewSku[]>("/sku/new");
  const monthly = useApi<MonthlyServicePoint[]>("/cost/monthly", { environment: fp.environment, app: fp.app, project: fp.project });

  const bySku = skuCost.data ?? [];
  const byService = new Map<string, number>();
  for (const r of bySku) byService.set(r.service_description, (byService.get(r.service_description) ?? 0) + r.net_cost_brl);
  const serviceRows = [...byService.entries()].sort((a, b) => b[1] - a[1]);
  const movers = topMovers(monthly.data);

  const drillEntries = (Object.keys(drill) as DrillDimension[]).map((dim) => ({
    dim,
    dimLabel: DRILL_LABEL[dim],
    value: drill[dim] as string,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Detalhe por SKU"
        title="Serviços & SKUs"
        desc="Composição serviço → SKU, top movers mês a mês, custo unitário no período."
      />
      <DrillBar entries={drillEntries} onRemove={(dim) => clear(dim as DrillDimension)} onClearAll={() => clear()} />

      {/* rpt_service_sku não tem project_id -- ver _require_unrestricted em routes.py. */}
      {unrestricted && newSkus.data && newSkus.data.length > 0 && (
        <Panel
          title="SKUs novos"
          cap={`${newSkus.data.length === 1 ? "1 SKU novo" : `${newSkus.data.length} SKUs novos`} nos últimos 30 dias — sem histórico pra comparar.`}
        >
          <DataTable
            rows={newSkus.data}
            search={(s) => `${s.service_description} ${s.sku_description}`}
            cols={[
              { key: "svc", label: "Serviço", render: (s: NewSku) => s.service_description, sort: (s) => s.service_description },
              { key: "sku", label: "SKU", render: (s: NewSku) => s.sku_description, sort: (s) => s.sku_description },
              { key: "d", label: "1ª ocorrência", render: (s: NewSku) => <span className="mono">{dayLabel(s.first_seen_date)}</span>, sort: (s) => s.first_seen_date },
            ]}
          />
        </Panel>
      )}

      <Panel title="Custo por serviço" cap={`Acumulado no período · ${dayLabel(win.from)} a ${dayLabel(win.to)}.`}>
        <LoadingOrError loading={skuCost.loading} error={skuCost.error} />
        {bySku.length > 0 && (
          <HBars
            rows={serviceRows.map(([label, value]) => ({ label, value }))}
            selected={drill.service}
            onSelect={(v) => toggle("service", v)}
          />
        )}
      </Panel>

      <Panel title="Top movers · mês anterior → mês corrente" cap="Maior variação absoluta no topo.">
        <LoadingOrError loading={monthly.loading} error={monthly.error} />
        {movers.length > 0 && (
          <DataTable
            rows={movers}
            cols={[
              { key: "s", label: "Serviço", render: (r: Mover) => r.service_description, sort: (r) => r.service_description },
              { key: "p", label: "Mês anterior", num: true, render: (r: Mover) => brl(r.prev), sort: (r) => r.prev },
              { key: "c", label: "Mês corrente", num: true, render: (r: Mover) => brl(r.curr), sort: (r) => r.curr },
              {
                key: "d",
                label: "Δ",
                num: true,
                render: (r: Mover) => (
                  <strong style={{ color: r.delta <= 0 ? "var(--status-ok-foreground)" : "var(--status-error-foreground)" }}>
                    {r.delta >= 0 ? "+" : ""}
                    {brl(r.delta)}
                  </strong>
                ),
                sort: (r) => Math.abs(r.delta),
              },
            ]}
          />
        )}
      </Panel>

      <Panel title="Composição serviço → SKU" cap="Mesma base do gráfico acima, detalhada por SKU — inclui custo unitário no período.">
        <LoadingOrError loading={skuCost.loading} error={skuCost.error} />
        {bySku.length > 0 && (
          <DataTable
            rows={bySku}
            defaultPageSize={20}
            search={(r) => `${r.service_description} ${r.sku_description}`}
            cols={[
              { key: "svc", label: "Serviço", render: (r: SkuCost) => r.service_description, sort: (r) => r.service_description },
              { key: "sku", label: "SKU", render: (r: SkuCost) => r.sku_description, sort: (r) => r.sku_description },
              { key: "unit", label: "Unidade", render: (r: SkuCost) => r.pricing_unit },
              { key: "qty", label: "Uso", num: true, render: (r: SkuCost) => <span className="mono">{num(r.usage_qty, 2)}</span>, sort: (r) => r.usage_qty },
              { key: "uc", label: "Custo unitário", num: true, render: (r: SkuCost) => <span className="mono">{brlPrecise(r.unit_cost_brl)}</span>, sort: (r) => r.unit_cost_brl },
              { key: "cost", label: "Custo", num: true, render: (r: SkuCost) => <strong>{brl(r.net_cost_brl)}</strong>, sort: (r) => r.net_cost_brl },
            ]}
          />
        )}
      </Panel>
    </>
  );
}
