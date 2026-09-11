# ADR-006 — Alerta de falha por e-mail

Data: 2026-09-09 · Status: aceito

## Contexto

Falhas do pipeline (build do Dataform ou assertion de qualidade) precisam notificar alguém.
O ecossistema já usa e-mail para `gcp-billing-platform@dp6.com.br` (budget alert do `polaris-cost-control`).

## Decisão

`google_monitoring_notification_channel` do tipo `email` para `gcp-billing-platform@dp6.com.br` +
`google_monitoring_alert_policy` **log-based** sobre o log de conclusão de `workflowInvocation`
com estado FAILED. Um canal + uma policy por ambiente.

## Alternativas consideradas

- **Google Chat (webhook)** com card vermelho/amarelo por severidade — pedido inicial, mas
  exigiria Cloud Function + Pub/Sub + Secret Manager só para formatar a mensagem. Descartado a
  favor da consistência com o alerta de orçamento existente.
- **Notification rule nativa do Dataform** → Pub/Sub/e-mail — o provider Terraform não expõe
  isso de forma estável; a alert policy log-based é garantida.

## Consequências

- Sem distinção de severidade entre assertion e falha de build (mesmo evento). A
  `documentation` da alert policy lista quais assertions checar.
- O filtro exato do log de conclusão do Dataform tem um comentário `CONFIRMAR` no
  `terraform/modules/data_stack/monitoring.tf` — validar no primeiro apply.
- Se o grupo `gcp-billing-platform@dp6.com.br` não aceitar e-mail de sistema, ajustar antes do apply.
