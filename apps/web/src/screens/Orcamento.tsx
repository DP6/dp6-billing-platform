import { Stub } from "./Stub";

export const Orcamento = () => (
  <Stub
    eyebrow="Orçamento mensal R$ 20,00"
    title="Orçamento & previsão"
    desc="Burn-down vs. orçamento, escada de thresholds 50/80/100/120%, projeção EOM e previsão de 3 meses com faixa."
    artboard="Orcamento.dc.html"
    endpoints={[
      { label: "Orçamento", path: "/budget" },
      { label: "Burn-down", path: "/budget/burndown" },
      { label: "Previsão 3 meses", path: "/forecast" },
    ]}
  />
);
