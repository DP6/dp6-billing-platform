import { useState } from "react";
import type { Filters } from "./useFilters";

export type DrillDimension = "service" | "environment" | "app" | "project";
export type DrillFilters = Partial<Record<DrillDimension, string>>;

export const DRILL_LABEL: Record<DrillDimension, string> = {
  service: "Serviço",
  environment: "Ambiente",
  app: "App",
  project: "Projeto",
};

/** Filtro por clique em gráfico (drill-down). Estado local da tela -- ao contrário dos
 *  filtros do topo (useFilters, na querystring), NÃO persiste entre telas: some sozinho
 *  quando o componente desmonta na troca de aba, de propósito (specs do drill-down).
 *  Acumula por dimensão (clicar em "atlas" e depois em "BigQuery" filtra os dois ao mesmo
 *  tempo). A FilterBar do topo tem prioridade -- clique numa dimensão já fixada lá é
 *  ignorado (o gráfico já estaria mostrando 1 valor só pra essa dimensão mesmo). */
export function useDrillFilters(topLevel: Filters) {
  const [drill, setDrill] = useState<DrillFilters>({});

  const toggle = (dim: DrillDimension, value: string) => {
    if (topLevel[dim]) return;
    setDrill((d) => {
      if (d[dim] === value) {
        const next = { ...d };
        delete next[dim];
        return next;
      }
      return { ...d, [dim]: value };
    });
  };

  const clear = (dim?: DrillDimension) => {
    setDrill((d) => {
      if (!dim) return {};
      if (!(dim in d)) return d;
      const next = { ...d };
      delete next[dim];
      return next;
    });
  };

  return { drill, toggle, clear };
}
