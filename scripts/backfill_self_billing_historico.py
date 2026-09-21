#!/usr/bin/env python3
"""Carga one-off do custo historico jan-jun/2026 (lacuna anterior ao billing_export real).

Le os 6 CSVs "DP6 Self Billing (Voucher)_Cost" exportados manualmente do console de
faturamento, limpa/tipa os dados e faz `bq load --replace` numa tabela BigQuery fixa
(billing_platform_stg_prod.raw_self_billing_historico). Ver docs/adr/ADR-010.

Uso:
  python3 scripts/backfill_self_billing_historico.py --input-dir <pasta com os 6 CSVs> \
      [--out <csv limpo de saida>] [--load]

Sem --load, so gera o CSV limpo em --out e imprime o total por mes (pra conferir contra o
"Valor total devido" do cabeculho de cada arquivo antes de gravar em BigQuery de verdade).
"""

import argparse
import csv
import glob
import os
import re
import subprocess
import sys

RAW_TABLE = "dp6-ci-polaris:billing_platform_stg_prod.raw_self_billing_historico"

COST_TYPE_MAP = {
    "Uso": "regular",
    "Tributo": "tax",
    "Erro de arredondamento": "rounding_error",
}

OUT_FIELDS = [
    "invoice_month",
    "usage_date",
    "project_id",
    "project_name",
    "service_description",
    "sku_description",
    "pricing_unit",
    "cost_type",
    "usage_amount_pricing_units",
    "gross_cost_brl",
    "fx_rate_brl_per_usd",
    "source_file",
]

SCHEMA = (
    "invoice_month:STRING,usage_date:DATE,project_id:STRING,project_name:STRING,"
    "service_description:STRING,sku_description:STRING,pricing_unit:STRING,cost_type:STRING,"
    "usage_amount_pricing_units:FLOAT,gross_cost_brl:FLOAT,fx_rate_brl_per_usd:FLOAT,"
    "source_file:STRING"
)


def parse_br_number(raw):
    """'2.267.293' -> 2267293.0 ; '- 0,001071' -> -0.001071 ; '' -> None."""
    s = (raw or "").strip()
    if not s:
        return None
    neg = s.startswith("-")
    if neg:
        s = s[1:].strip()
    s = s.replace(".", "").replace(",", ".")
    value = float(s)
    return -value if neg else value


def extract_fx_rate(meta_lines):
    for parts in csv.reader(meta_lines):
        if parts and parts[0].strip() == "Taxa de câmbio monetária":
            return parse_br_number(parts[1])
    raise ValueError("Taxa de câmbio monetária não encontrada no cabeçalho do arquivo")


def invoice_month_from_filename(path):
    # "..._Cost, 2026-06-01 — 2026-06-30.csv" -> "202606"
    m = re.search(r"(\d{4})-(\d{2})-\d{2}\s*[—-]", os.path.basename(path))
    if not m:
        raise ValueError(f"não consegui derivar invoice_month do nome do arquivo: {path}")
    return m.group(1) + m.group(2)


def process_file(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        raw_lines = f.readlines()

    meta_lines = raw_lines[:8]
    fx_rate = extract_fx_rate(meta_lines)
    invoice_month = invoice_month_from_filename(path)
    source_file = os.path.basename(path)

    reader = csv.DictReader(raw_lines[8:])
    rows = []
    total_kept_brl = 0.0
    for row in reader:
        cost_type_raw = (row.get("Tipo de custo") or "").strip()
        if cost_type_raw in ("", "Total"):
            # linha de resumo do mes (ultima linha do arquivo) ou linha vazia
            continue
        cost_type = COST_TYPE_MAP.get(cost_type_raw)
        if cost_type is None:
            raise ValueError(f"{path}: Tipo de custo inesperado: {cost_type_raw!r}")

        service_description = (row.get("Descrição do serviço") or "").strip() or "Impostos e ajustes"
        gross_cost_brl = parse_br_number(row.get("Custo não arredondado (R$)"))

        rows.append(
            {
                "invoice_month": invoice_month,
                "usage_date": (row.get("Data de início do uso") or "").strip() or None,
                "project_id": (row.get("ID do projeto") or "").strip() or None,
                "project_name": (row.get("Nome do projeto") or "").strip() or None,
                "service_description": service_description,
                "sku_description": (row.get("Descrição da SKU") or "").strip() or None,
                "pricing_unit": (row.get("Unidade de uso") or "").strip() or None,
                "cost_type": cost_type,
                "usage_amount_pricing_units": parse_br_number(row.get("Quantidade de uso")),
                "gross_cost_brl": gross_cost_brl,
                "fx_rate_brl_per_usd": fx_rate,
                "source_file": source_file,
            }
        )
        total_kept_brl += gross_cost_brl or 0.0

    return rows, total_kept_brl


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--input-dir", required=True, help="pasta com os 6 CSVs baixados")
    ap.add_argument(
        "--pattern",
        default="Tabela DP6 Self Billing (Voucher)_Cost, *.csv",
        help="glob dos arquivos de entrada dentro de --input-dir",
    )
    ap.add_argument("--out", default="self_billing_historico_clean.csv")
    ap.add_argument(
        "--load",
        action="store_true",
        help="depois de gerar o CSV limpo, roda `bq load --replace` de verdade contra "
        f"{RAW_TABLE}. SEM esta flag o script só gera e imprime o resumo (seguro).",
    )
    ap.add_argument(
        "--impersonate-sa",
        default=None,
        help="conta de serviço a impersonar pro load (ex. "
        "sa-billing-platform-dataform@dp6-ci-polaris.iam.gserviceaccount.com). Necessário se "
        "sua conta pessoal não tem bigquery.tables.create no dataset destino — a SA do "
        "Dataform já tem dataOwner em billing_platform_stg_* (ver datasets.tf). O bq desta "
        "versão não aceita --impersonate_service_account direto, então isto usa `gcloud config "
        "set/unset auth/impersonate_service_account` ao redor do load (desfeito sempre, mesmo "
        "se o load falhar).",
    )
    args = ap.parse_args()

    paths = sorted(glob.glob(os.path.join(args.input_dir, args.pattern)))
    if not paths:
        print(f"nenhum arquivo casou com {args.pattern!r} em {args.input_dir}", file=sys.stderr)
        sys.exit(1)

    all_rows = []
    print(f"{'arquivo':<70} {'linhas':>7} {'soma custo bruto (R$)':>24}")
    for path in paths:
        rows, total = process_file(path)
        all_rows.extend(rows)
        print(f"{os.path.basename(path):<70} {len(rows):>7} {total:>24,.2f}")

    with open(args.out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=OUT_FIELDS)
        writer.writeheader()
        writer.writerows(all_rows)
    print(f"\n{len(all_rows)} linhas escritas em {args.out}")
    print(
        "Confira a soma de cada mês acima contra 'Valor total devido' (linha 7 do "
        "cabeçalho) de cada CSV original antes de rodar com --load."
    )

    if args.load:
        print(f"\nCarregando em {RAW_TABLE} (bq load --replace)...")
        if args.impersonate_sa:
            subprocess.run(
                ["gcloud", "config", "set", "auth/impersonate_service_account", args.impersonate_sa],
                check=True,
            )
        try:
            subprocess.run(
                [
                    "bq",
                    "load",
                    "--source_format=CSV",
                    "--skip_leading_rows=1",
                    "--replace",
                    f"--schema={SCHEMA}",
                    RAW_TABLE,
                    args.out,
                ],
                check=True,
            )
        finally:
            if args.impersonate_sa:
                subprocess.run(
                    ["gcloud", "config", "unset", "auth/impersonate_service_account"], check=True
                )
        print("Carga concluída.")


if __name__ == "__main__":
    main()
