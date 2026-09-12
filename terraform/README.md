# terraform/

Infra do `dp6-billing-platform` — padrão do Atlas (diretórios por ambiente, **não** workspaces).
Provider `google ~> 6.0` (Cloud Run usa `google-beta` por causa de `iap_enabled`).

```
terraform/
├── bootstrap/            # state LOCAL, apply manual 1x — WIF, SAs, state bucket, APIs,
│                         #   Artifact Registry, Secret (git token), google_dataform_repository
├── modules/
│   ├── data_stack/       # por ambiente: 4 datasets billing_platform_*_<env> + IAM,
│   │                     #   Dataform release_config + 2 workflow_config, alerta e-mail
│   └── app_service/      # 1 Cloud Run v2 + SA de runtime + IAP (usado p/ api e web)
└── environments/
    ├── dev/              # state remoto GCS (prefix environments/dev) — via CI
    └── prod/             # idem (prefix environments/prod)
```

## Ordem

1. **`bootstrap/`** — ver `bootstrap/README.md`. Aplica à mão, uma vez.
2. **Grant externo** (TI) — `dataViewer` para `sa-billing-platform-dataform` na view `billing_export_resource`.
3. **`environments/{dev,prod}/`** — aplicados pelo CI (`terraform-apply.yml`) no merge em `main`,
   ou à mão com `terraform init -backend-config=...`.

## Convenções

- Datasets/serviços com sufixo `_dev` / `_prod`. O Dataform usa `schema_suffix` no
  `release_config` — os `.sqlx` não mudam.
- Nunca commitar `*.tfstate*`, `*.tfvars` (só `.example`), `.terraform/`.
- `terraform fmt` + `validate` antes de abrir PR.
