import { Stub } from "./Stub";

export const UnitEconomicsScreen = () => (
  <Stub
    eyebrow="Unit economics & eficiência"
    title="Unit economics & eficiência"
    desc="Custo por deploy / 1k req / GB log, waterfall preço-de-tabela → líquido, taxa de economia efetiva, custo evitado."
    artboard="UnitEconomics.dc.html"
    endpoints={[
      { label: "Unit economics", path: "/unit-economics" },
      { label: "Waterfall", path: "/efficiency/waterfall" },
      { label: "Série custo/req", path: "/unit-economics/series", withFilters: true },
    ]}
  />
);
