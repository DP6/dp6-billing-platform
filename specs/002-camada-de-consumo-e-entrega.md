# Spec 002 — Camada de consumo e entrega (engenharia reversa)

Status: 🟡 rascunho para revisão · Data: 2026-09-09
Depende de: `specs/001-modelagem-billing-export-bq.md` (dicionário de indicadores, marts)

## Revisão pós-canvas (2026-09-09) — IA ampliada, APROVADA — sobrepõe tudo abaixo

Referência visual aprovada: canvas de design em `mock/canvas/*.dc.html` (8 telas). A IA passa
de 4 para **8 abas**. **Orçamento revisado para R$ 20** (reconciliar com `polaris-cost-control/specs/001`, que diz R$ 50).

| # | Aba | Widgets principais | Fonte |
|---|---|---|---|
| 1 | **Visão geral** | scorecard de 6 (net MTD, run-rate, Δ MoM, créditos, custo vs orçamento R$ 20, **economia efetiva**) · custo diário + média 7d · custo por serviço · reconciliação · tira de saúde dos dados | billing export |
| 2 | **Orçamento & previsão** | burn-down MTD vs R$ 20 · escada de thresholds 50/80/100/120% (R$ 10/16/20/24) · projeção EOM (linear) · previsão 3 meses (tendência + faixa) · data projetada de estouro | billing export (histórico curto → faixa larga) |
| 3 | **Tendência** | empilhado mensal por serviço · Δ MoM + run-rate fantasma · ritmo acumulado · sazonalidade | billing export |
| 4 | **Alocação · showback** | cobertura por label (managed-by/app/environment) + **progressão semanal** · custo por app · custo por ambiente · **custo não-alocado** · prontidão de chargeback | billing export + checklist manual |
| 5 | **Serviços & SKUs** | composição serviço→SKU · top movers ago→set · tabela de custo unitário | billing export |
| 6 | **Otimização & waste** | cobertura de compromissos (0%) · **recomendações** (rightsizing Cloud Run, dev 24/7, imagens antigas, retenção de log) · economia potencial | **cobertura de CUD = billing export; recomendações = FORA do billing export** (Asset Inventory / config APIs / lista curada) |
| 7 | **Unit economics & eficiência** | **waterfall** preço-de-tabela → desconto → créditos → líquido (`cost_at_list` volta a ser usado) · taxa de economia efetiva · custo evitado · custo por 1k req / GB log / vCPU·s | waterfall + por-GB/vCPU = billing export; **custo por deploy = FORA** (Cloud Build / GH Actions / eventos de revisão no Cloud Logging) |
| 8 | **Anomalias** | resumo · ocorrências + sparkline + "dar baixa" · regra `z>3 AND > R$ 1/dia` | billing export |

Efeitos:
- **Aba Economia volta** — dentro de "Unit economics" (waterfall). `list_savings`/`cost_at_list`
  **saem de "dormante"** e voltam às marts/reporting (mesmo com desconto negociado = R$ 0, o
  waterfall prova isso).
- **Showback vira "Alocação"** — aba real, não placeholder (mas o rateio por app/ambiente
  ainda cobre só 4–10% do custo; o resto é "não-alocado").
- **`rpt_*` cresce** — ver `docs/data-contract.md` §6 (escopo ampliado). Novos:
  `rpt_budget_daily`, `rpt_forecast_monthly`, `rpt_label_coverage_weekly`, `rpt_showback_monthly`,
  `rpt_savings_waterfall` (**volta**), `rpt_unit_economics`, `rpt_commitment_coverage`.
  Recomendações de otimização e custo-por-deploy **não são Dataform** — a API lê de fonte
  externa / config (a definir na `specs/003`).
- A Fase 2.5 A (data-contract + reconciliação de marts) precisa de um segundo passe para as 4
  telas novas.

## Deltas da Fase 2 (2026-09-09) — sobrepõem o texto abaixo

`validation/RESULTADOS.md` consolidada. Efeito nesta spec:

- **6 abas → 4**: Visão Geral · Tendência · Serviços & SKUs · Anomalias. **Aba Economia
  removida** (sem `list_savings`, créditos triviais). **Aba Showback = placeholder** (cobertura
  de label 4–10%; só o gráfico de cobertura ativo + aviso).
- **Scorecard:** remover "economia (list savings)". Manter net cost MTD, run-rate, Δ MoM,
  créditos no mês, custo vs orçamento R$ 50.
- **Anomalia:** z-score **e** piso absoluto (`net_cost_day > R$ 1`), senão vira ruído a R$ 26/mês.
- **`rpt_*`:** remover `rpt_savings_waterfall`. `rpt_showback` só alimenta o gráfico de cobertura.
- **Top serviços:** dominado por Cloud Run (82%). Usar "Cloud Run vs resto" ou escala log.

## Objetivo

Antes de escrever as queries de produção e travar a arquitetura de datasets/tabelas, desenhar
o consumo **de trás para frente**: definir os dashboards (abas, indicadores, gráficos) → derivar
uma camada de *reporting* (views largas por *shape de query*) → reconciliar com as marts da
Fase 3, decidindo se elas bastam ou mudam. Também levantar as opções de entrega na ponta
(onde o dashboard roda) com um comparativo, sem fechar a decisão nesta spec.

## Escopo

- **A — Método de engenharia reversa** (contract-first): da IA dos dashboards até a coluna de origem.
- **B — Opções de entrega**: comparativo de 5 alternativas; recomendação; o que cada uma exige da camada de reporting. **Decisão fica em aberto.**
- **C — IA dos dashboards**: 6 abas canônicas FinOps, indicadores por aba, tipo de gráfico por indicador, regras do DP6 Design System. Entregue como *strawman* para revisão.
- **Camada `definitions/reporting/`**: especificação das views `rpt_*` (nomes, grão, colunas), materialização (view vs tabela) pendente de B.
- **Contrato de dados**: `docs/data-contract.md` — matriz `widget → rpt_* → mart → staging → coluna de origem`.

## Fora de escopo

- Implementar os `rpt_*` em SQLX (Fase 3).
- Implementar o dashboard (frontend/Looker) — spec própria depois da decisão B.
- Escolher a ferramenta de entrega — decisão do usuário, registrada em ADR quando tomada.
- Rederivar o dicionário de indicadores — é da `specs/001`; esta spec só o consome.

---

## A. Método de engenharia reversa (contract-first)

1. **Travar a IA dos dashboards** (seção C) — vira o contrato de consumo.
2. **Por widget**, escrever a query ideal contra uma tabela hipotética perfeita e anotar:
   grão, dimensões, medidas (nomes do dicionário da `specs/001`), janela de tempo, filtros aplicáveis.
3. **Agrupar os widgets por *shape de query*** — mesma combinação de grão + dimensões + janela.
   Cada grupo vira **uma** view `rpt_*`, larga e desnormalizada (não uma view por widget).
4. **Reconciliar cada `rpt_*` com as marts da `specs/001`** (`fct_billing_cost_daily`,
   `agg_billing_cost_monthly`, `vw_billing_daily_anomaly`, `dim_service_sku`):
   - a mart serve como está → `rpt_*` é um `SELECT` com renomeações/derivações leves;
   - falta dimensão/medida → adicionar coluna à mart;
   - grão errado → nova mart ou re-grão;
   - **decisão "manter vs redesenhar" é registrada aqui, por `rpt_*`.**
5. **Fechar staging + parâmetros** com a Fase 2: `lookback_days` (#06), `label_keys` (#04),
   estratégia de dedup (#09), o que a view já faz (#11).
6. **Saída:** `docs/data-contract.md` preenchido; lista final de marts na `specs/001`;
   `definitions/reporting/` especificada abaixo.

### Camada `definitions/reporting/` — 6 views (FECHADA — ver `docs/data-contract.md`)

| View (`type: view`) | Grão | Fonte | Serve |
|---|---|---|---|
| `rpt_cost_daily` | `usage_date × service × sku × pricing_unit × cost_type × label_environment × label_app` | `fct_billing_cost_daily` | VG (tendência, top serviços), Tendência (API rola p/ mês), Serviços & SKUs, Anomalias (sparkline/drill) |
| `rpt_cost_monthly` | `invoice_month × service × label_environment × label_app × cost_type` (+ `LAG`/MoM) | `agg_billing_cost_monthly` + janelas | Tendência, VG (reconciliação) |
| `rpt_cost_scorecard` | 1 linha (mês corrente) + orçamento R$ 50 | `agg_billing_cost_monthly` | VG (scorecard) |
| `rpt_service_sku` | `service × sku × pricing_unit` + `first_seen`/`is_new_30d` | `dim_service_sku` | Serviços & SKUs (SKU novo; custo unitário a API calcula de `rpt_cost_daily`) |
| `rpt_anomaly_daily` | `usage_date × service` + `z_score`, `is_anomaly` (`z>3 AND net>R$1`) | `vw_billing_daily_anomaly` | Anomalias |
| `rpt_label_coverage` | `invoice_month` (% do custo com cada label) | `fct_billing_cost_daily` | Showback (placeholder) |

Materialização = **views** Dataform (scan irrisório). Removidas do rascunho: `rpt_cost_by_sku`
(a API agrega `rpt_cost_daily`), `rpt_savings_waterfall` (sem economia), `rpt_showback`
(virou `rpt_label_coverage`). Matriz widget→endpoint→view→coluna: `docs/data-contract.md`.

---

## B. Opções de entrega na ponta

> **DECIDIDO (2026-09-09): app React standalone no `dp6-billing-platform`.** Controle total do
> DP6 Design System, isolado do Atlas. Aceito o custo de hosting/auth/deploy próprios. Registrar
> em `docs/adr/ADR-004-entrega-app-standalone.md`. Comparativo abaixo mantido como histórico.

Público confirmado: **os dois usos** — operacional diário (time CI/dev: anomalia, o que subiu,
qual SKU) e revisão executiva mensal (fechamento, evolução, projeção vs orçamento, showback).

| Opção | Esforço inicial | Fidelidade ao DP6 DS | Quem edita o dashboard | Governança / CI | Onde a query roda | Camada semântica exigida | Encaixe no ecossistema |
|---|---|---|---|---|---|---|---|
| **Looker Studio** sobre as marts | Baixo | Baixa (tema limitado, sem Ubuntu/paleta fiel) | Não-dev, no próprio Looker Studio | Fraca — fora de git, sem PR/review | BigQuery direto (BI Engine opcional) | Views SQL largas (`rpt_*`) | Isolado. Ótimo como camada **interina** de exploração |
| **Seção "Custo GCP" no Atlas** | Médio | Alta — `index.css` + Recharts + `MetricGrid`/`MetricTile` | Dev, via PR | Forte — WIF, spec-driven, `docs/frontend/` | FastAPI → BigQuery; devolve DTOs tipados | Views SQL + DTOs de API | Alto — reusa auth/IAP, Cloud Run, deploy, design system |
| **App React standalone** no `dp6-billing-platform` | Alto | Alta — tokens do DS direto | Dev, via PR | Forte, mas pipeline/host/auth novos | App → BigQuery (ou API própria) | Views SQL + DTOs | Médio — duplica hosting/auth/deploy |
| **Looker core / Looker Studio Pro** | Médio-alto | Média | Analista, via LookML em git | Forte, mas exige licença | BigQuery via LookML | Modelo LookML sobre as marts (sem views SQL) | Isolado. Só se a DP6 padronizar Looker |
| **Grafana** (datasource BigQuery) | Baixo-médio | Baixa | Dev/ops | Média | BigQuery direto | Views SQL | Bom p/ série temporal/ops; fraco p/ executivo/showback |

**Acoplamentos:** a escolha determina (1) a materialização de `rpt_*` — view SQL, tabela,
LookML ou DTO; (2) o modelo de auth do dashboard; (3) quem consegue editar/criar visões.

### Arquitetura do app standalone (decidida)

Espelha o padrão já provado do Atlas no mesmo projeto GCP (`dp6-ci-polaris`), sem depender dele.

- **Repositório:** tudo no `dp6-billing-platform`. Estrutura ganha `apps/api/` + `apps/web/`
  ao lado do projeto Dataform na raiz (o Dataform Core só compila `definitions/`+`includes/`).
- **`apps/api/`** — backend fino (FastAPI, `uv`, como o Atlas). Só lê as views `rpt_*` em
  `billing_platform_mart` e devolve DTOs JSON tipados. Sem lógica de negócio (ela está no SQL).
  Roda em Cloud Run (`billing-platform-api-prod`).
- **`apps/web/`** — SPA React + Vite + TypeScript + **Recharts** + Tailwind. **Tokens do DP6
  Design System aplicados direto** de `polaris-heap/DP6-Design-System.md` (`tokens/colors.css`
  etc.) — sem shadcn herdado do Atlas. Build estático servido por Cloud Run (`billing-web-prod`).
- **Auth:** IAP na frente dos dois serviços Cloud Run (mesma abordagem do Atlas), allowlist de
  e-mails DP6. Sem sessão/JWT próprios no MVP.
- **Materialização de `rpt_*`:** **views** Dataform (`type: view`) em `billing_platform_mart`
  (ou dataset `billing_platform_reporting`). Sem tabela pré-agregada — scan é irrisório (R$ 26).
- **Infra (Terraform, Fase 4):** + 2 Cloud Run + IAP + `apps` no Artifact Registry + SA de
  runtime da API com `bigquery.dataViewer` em `billing_platform_mart` + `bigquery.jobUser`.
- **CI (Fase 5):** + `apps/api` e `apps/web` — lint/test/build/deploy via WIF, deploy em `main`.
- **Componentes de gráfico:** criar `apps/web/src/charts/` sobre Recharts com a paleta oficial
  (azul `#1A365D` net, vermelho `#D64500` queda/anomalia, verde `#059669`, roxo `#6B46C1`),
  Ubuntu Mono nas figuras, formatação PT-BR (`R$ 1.284,93`).
- **Contrato de dados:** `docs/data-contract.md` (widget → DTO → `rpt_*` → mart → origem).
- Fica para uma **spec 003** o detalhe do app (telas, endpoints, response schemas, ACs).
- Confirmar a expansão de escopo com os donos do Atlas (o produto se define como "somente
  leitura, sem pipeline" — consumir tabela curada de billing não fere isso, mas é decisão deles).

---

## C. IA dos dashboards (strawman canônico FinOps)

Seis abas. Cada indicador cita a medida do dicionário da `specs/001`. Validar layout e
primitivas contra `polaris-heap/ui_kits/report/Charts.jsx` e `atlas/docs/frontend/patterns.md`
(§3 Linha de KPIs, §2 Tabela filtrável e ordenável).

### Filtros globais
Intervalo de datas / `invoice_month` · serviço · `environment` · `app` · `cost_type` · moeda (BRL/USD).
Padrão: mês corrente, `cost_type = regular`, moeda BRL.

### Aba 1 — Visão Geral  *(executivo + porta de entrada operacional)*

| Elemento | Indicador (medida) | Gráfico / componente |
|---|---|---|
| Scorecard | custo líquido MTD (`net_cost`, R$ e US$); run-rate fim de mês (`run_rate_eom`); Δ MoM % (`mom_pct`); créditos no mês (`credits_total`); economia (`list_savings`); custo vs orçamento R$ 50 | `MetricGrid` + `MetricTile` (Ubuntu Mono; `alert` vermelho se run-rate > orçamento); régua amarela 2px no bloco |
| Tendência diária | `net_cost` por dia + média móvel 7d | Área azul `#1A365D` + linha da média; eixo Y em R$ PT-BR |
| Top serviços | `net_cost` por serviço, Top N + "outros" | Barra horizontal azul; "outros" em cinza `#5B626C` |
| Reconciliação | `net_cost` por `invoice_month` vs. fatura | Mini-barras + tabela (3 meses); nota "bate com a fatura" |

### Aba 2 — Tendência / Evolução  *(executivo)*

| Elemento | Indicador | Gráfico |
|---|---|---|
| Composição no tempo | `net_cost` por serviço por mês | Área empilhada, ≤5 séries da paleta + "outros" cinza |
| Barras mensais | `net_cost` mensal + `mom_abs`/`mom_pct` + `run_rate_eom` no mês aberto | Barras com rótulo de Δ; linha tracejada de run-rate no último mês |
| Pace acumulado | acumulado do mês corrente vs mês anterior | Duas linhas (corrente sólida azul, anterior cinza) |
| Calendário (opcional) | `net_cost` diário | Heatmap de calendário, escala sequencial de azul |

### Aba 3 — Serviços & SKUs  *(operacional)*

| Elemento | Indicador | Gráfico |
|---|---|---|
| Composição | `net_cost` por serviço → drill SKU | Treemap **ou** barra clicável service→SKU |
| Custo unitário | `net_cost / usage_amount_pricing_units` por SKU (+ `pricing_unit`) | Tabela ordenável (pattern §2), Ubuntu Mono |
| SKU novo | SKUs com `first_seen_date` recente (`dim_service_sku`) | Chip de atenção (badge) na linha + callout no topo |

### Aba 4 — Economia  *(executivo)*

| Elemento | Indicador | Gráfico |
|---|---|---|
| Ponte de custo | `cost_at_list` → −desconto negociado (`list_savings`) → −`credits_total` → `net_cost` | Waterfall; degraus de queda em verde `#059669` |
| Taxa efetiva | `1 − net_cost / cost_at_list` | Donut/gauge verde + número grande |
| Créditos por tipo | `credits_cud/sud/promo/free_tier/other` | Barras — **só se validação #03 mostrar tipos com peso**; senão, só `credits_total` |

### Aba 5 — Showback  *(executivo)* — **depende da validação #04**

| Elemento | Indicador | Gráfico |
|---|---|---|
| Custo por app/ambiente | `net_cost` por `label_app` × `label_environment` | Barras agrupadas ou empilhadas |
| Cobertura de label | % do `net_cost` com `label_app` / `label_environment` preenchido | Donut + número; callout "custo sem label" |

> Se a cobertura de label for ≈ 0 hoje (provável — `finops-labels.md` diz que a aplicação nos
> recursos é "execução futura"), a aba entra como **placeholder** com a mensagem "aguardando
> aplicação das labels" e só o gráfico de cobertura ativo.

### Aba 6 — Anomalias  *(operacional)*

| Elemento | Indicador | Gráfico |
|---|---|---|
| Dias sinalizados | `is_anomaly`, `z_score`, desvio vs `avg_28d` (`vw_billing_daily_anomaly`) | Tabela ordenável (serviço, dia, `net_cost`, desvio) |
| Contexto | série diária do serviço com o dia destacado | Sparkline por linha; dia sinalizado em vermelho `#D64500` |
| Drill | SKUs do dia sinalizado | Expansão da linha → tabela de SKUs |

### Regras de design (DP6 Design System)

- **Paleta de gráficos** (de `DP6-Design-System.md`, split light/dark):
  neutro / `net_cost` = azul `#1A365D`; queda / anomalia / negativo = vermelho `#D64500`;
  economia / positivo = verde `#059669`; créditos / premium = roxo `#6B46C1`; 5ª série = rosa
  `#D81B60`; areia `#F4F1EA` **só** como fundo de card, nunca série. Dark → variantes `*-on-dark`.
- **Números PT-BR:** `R$ 1.284,93`, `+3,84%`, `4,59` — milhar `.`, decimal `,`. **Ubuntu Mono**
  em toda figura/tabela numérica.
- **Cards:** flat, borda 1px hairline, radius 8px, padding 24px, **sem sombra em repouso**;
  régua amarela 2px só no scorecard principal. Sombra só em hover (`shadow-md`).
- **Sem emoji.** Unicode só funcional (✓ ×). Eyebrow: uppercase, 12–16px, tracking `.28em`.
- **Animação:** 140ms hover/press, 220ms troca de aba; colapsa a 0ms sob `prefers-reduced-motion`.
- **Layout:** composição alinhada à esquerda, bastante respiro; um `<h1>` por rota (`PageHeader`).

---

## Sequência de execução da Fase 2.5

1. ✅ Consolidar `validation/RESULTADOS.md` (Fase 2).
2. ✅ C revisada → 4 abas → **canvas aprovado com 8 abas** (ver "Revisão pós-canvas" no topo).
3. ✅ B decidido → app standalone (ADR-004 a escrever).
4. ✅ A rodado (2 passes) → `docs/data-contract.md` §3–§7; **13 views `rpt_*`**; reconciliação
   das marts no §4/§6.
5. ✅ `specs/003-app-standalone.md` — arquitetura, 8 telas, 21 endpoints + schemas, IAP, ACs.
6. ✅ Fase 3 (Dataform) — `workflow_settings.yaml` + `includes/constants.js` + `definitions/`
   (source · staging · 4 marts · 13 `reporting/rpt_*` · 4 assertions). `dataform compile` OK (23 ações).
7. ✅ Fase 5 (app) — `apps/api/` (FastAPI, 22 endpoints, modo mock, `pytest` ✅) +
   `apps/web/` (React+Recharts, shell + Visão geral + 7 stubs, `tsc` ✅). Ver `apps/README.md`.
8. ✅ Fase 6 (Terraform) rascunho — `bootstrap/` + `modules/{data_stack,app_service}` +
   `environments/{dev,prod}/` + `.github/workflows/` (5). `terraform fmt` OK.
9. ✅ Fase 7 (Docs) — 7 ADRs, `CLAUDE.md`, `SESSIONLOG.md`, `CHANGELOG.md`.
10. **Rascunho das Fases 1–7 completo. Nada aplicado no GCP.** Próximos passos exatos em
    `SESSIONLOG.md` (grant da TI → seed do repo → apply bootstrap → apply dev → validar).

## Critério de verificação

1. Toda célula de "Indicador" nas 6 abas mapeia para uma medida existente no dicionário da `specs/001` (ou gera um item de mudança de mart, registrado).
2. `docs/data-contract.md` não tem widget sem `rpt_*`/mart/staging/coluna de origem.
3. Cada `rpt_*` tem grão único declarado e uma decisão "mart serve / mart muda" registrada.
4. Layout e componentes conferidos contra `polaris-heap/ui_kits/report/` e `atlas/docs/frontend/patterns.md`.
5. Decisão de entrega (B) registrada em `docs/adr/ADR-00X-entrega-dashboard.md`.

## Decisões em aberto

- **Entrega (B):** qual das 5 opções. Recomendação: seção no Atlas + Looker Studio interino.
- **Materialização de `rpt_*`:** view vs tabela pré-agregada — depende de B e do custo de scan.
- **Aba Showback:** placeholder ou ativa — depende da cobertura de label (#04).
- **Créditos por tipo:** entram na aba Economia? — depende de #03.
- **Treemap vs barra** na aba Serviços & SKUs — decidir no design visual.
- **Heatmap de calendário** (Aba 2) — incluir ou cortar do MVP.
