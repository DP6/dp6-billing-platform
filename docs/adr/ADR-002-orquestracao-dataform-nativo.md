# ADR-002 — Orquestração: Dataform nativo

Data: 2026-09-09 · Status: aceito

## Contexto

O pipeline (staging → marts → reporting → assertions) precisa rodar 1×/dia + um fechamento
mensal com `--full-refresh`, com alerta em caso de falha.

## Decisão

Usar o **agendamento nativo do Dataform**: `google_dataform_repository_release_config`
(compila o repo num `git_commitish`) + `google_dataform_repository_workflow_config` (executa a
tag `billing_platform`), um par por ambiente, mais um `workflow_config` mensal de close-out.
Alerta via Cloud Monitoring (log-based) → e-mail (ver ADR-006).

## Alternativas consideradas

- **Cloud Workflows + Cloud Scheduler** chamando a API do Dataform (compile → invoke → polling
  → classifica falha) — mais controle (severidade diferente para assertion vs build, card no
  Chat), mas ~40 linhas de YAML a manter e ainda precisaria de uma Cloud Function pra formatar
  mensagem. Descartado: os requisitos (e-mail simples, sem card) não justificam.
- **Cloud Composer / Airflow** — não há Composer no ambiente; overkill para 5 modelos.

## Consequências

- Zero infra extra além dos `release/workflow_config`.
- Menos controle sobre a mensagem de erro (assertion e build falham como o mesmo evento
  "workflowInvocation FAILED"); mitigado pela documentação da alert policy apontando quais
  assertions checar.
- O `schema_suffix` no `release_config` dá o isolamento dev/prod sem tocar nos `.sqlx`.
