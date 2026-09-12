import { Stub } from "./Stub";

export const Tendencia = () => (
  <Stub
    eyebrow="Evolução mês a mês"
    title="Tendência"
    desc="Empilhado mensal por serviço, variação mês a mês com run-rate, ritmo acumulado."
    artboard="Tendencia.dc.html"
    endpoints={[
      { label: "Custo mensal por serviço", path: "/cost/monthly", withFilters: true },
      { label: "Reconciliação (para Δ MoM)", path: "/reconciliation" },
      { label: "Série diária (para ritmo acumulado)", path: "/cost/daily", withFilters: true },
    ]}
  />
);
