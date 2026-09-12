import { Stub } from "./Stub";

export const Servicos = () => (
  <Stub
    eyebrow="Detalhe por SKU"
    title="Serviços & SKUs"
    desc="Composição serviço → SKU, top movers mês a mês, tabela de custo unitário, callout de SKU novo."
    artboard="Servicos.dc.html"
    endpoints={[
      { label: "Custo por SKU", path: "/cost/by-sku", withFilters: true },
      { label: "SKU novo (30 dias)", path: "/sku/new" },
    ]}
  />
);
