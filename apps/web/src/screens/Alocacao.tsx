import { Stub } from "./Stub";

export const Alocacao = () => (
  <Stub
    eyebrow="Rateio por app / ambiente"
    title="Alocação · showback"
    desc="Cobertura de label (3 chaves) + progressão semanal, custo por app / por ambiente, custo não-alocado, prontidão de chargeback."
    artboard="Alocacao.dc.html"
    endpoints={[
      { label: "Cobertura de label", path: "/allocation/coverage" },
      { label: "Cobertura semanal", path: "/allocation/coverage/weekly", withFilters: true },
      { label: "Por app + não-alocado", path: "/allocation/by-app", withFilters: true },
      { label: "Por ambiente", path: "/allocation/by-env", withFilters: true },
      { label: "Prontidão de chargeback", path: "/allocation/chargeback-readiness" },
    ]}
  />
);
