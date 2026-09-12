# ADR-004 — Entrega na ponta: app React standalone

Data: 2026-09-09 · Status: aceito

## Contexto

O painel FinOps atende dois usos — operacional diário (time CI/dev) e revisão executiva
mensal. Precisa seguir o DP6 Design System e ter governança (PR, CI). Comparativo de 5 opções
em `specs/002` §B.

## Decisão

**App React standalone** no `dp6-billing-platform`: `apps/api/` (FastAPI fino, lê só as views
`rpt_*`) + `apps/web/` (React + Vite + Recharts, tokens do DP6 DS direto). Ambos em Cloud Run
v2 atrás de **IAP**, com allowlist `group:gcp-billing-platform@dp6.com.br`.

## Alternativas consideradas

- **Looker Studio** sobre as marts — rápido, editável por não-dev, mas baixa fidelidade ao
  DP6 DS e governança fraca (fora de git).
- **Seção "Custo GCP" no `atlas`** — herdaria auth/deploy/DS do Atlas, mas expandiria o escopo
  de um produto "somente leitura" e criaria acoplamento entre repos.
- **Looker core / Grafana** — licença / foco em ops; não encaixam.

## Consequências

- Hosting/auth/deploy próprios (2 Cloud Run + IAP + Artifact Registry no Terraform).
- `rpt_*` materializados como **views** Dataform (scan irrisório a R$ 26/mês).
- Contrato API↔dados em `docs/data-contract.md`; DTOs em `specs/003` §Schemas.
- Telas 6 (Otimização) e 7 (Unit economics) usam dados **fora do billing export**
  (recomendações curadas em `apps/api/recommendations.yaml`, `deploy_count` em config) —
  automação futura via Cloud Asset Inventory / Cloud Logging.
