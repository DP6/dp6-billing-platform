# Valores não-sensíveis do ambiente dev — carregado automaticamente.
# Sobrescreve os defaults de variables.tf quando necessário.

git_commitish = "develop"

# o CI publica a imagem real e faz o deploy; o TF ignora mudanca de `image` via
# lifecycle, entao api_image so vale pro 1o create:
# api_image = "us-central1-docker.pkg.dev/dp6-ci-polaris/apps/billing-platform-api:dev"
