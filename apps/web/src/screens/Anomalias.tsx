import { Stub } from "./Stub";

export const Anomalias = () => (
  <Stub
    eyebrow="Dias fora do padrão"
    title="Anomalias"
    desc="Ocorrências (z-score > 3 E > R$ 1/dia) com sparkline e baixa. Resumo: em aberto, no mês, impacto acima da média."
    artboard="Anomalias.dc.html"
    endpoints={[{ label: "Ocorrências", path: "/anomalies", withFilters: true }]}
  />
);
