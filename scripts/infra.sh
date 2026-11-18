#!/usr/bin/env bash
# Uso: scripts/infra.sh plano   -> mostra o que será criado ou alterado (não muda nada)
#      scripts/infra.sh aplicar -> aplica exatamente o último plano gerado
source "$(dirname "$0")/comum.sh"; conferir_conta
cd "$RAIZ/infra"
[ -f terraform.tfvars ] || { echo "Falta infra/terraform.tfvars (copie de terraform.tfvars.example e preencha o e-mail)."; exit 1; }
case "${1:-}" in
  plano) (cd "$RAIZ/backend/cadastro" && npm test --silent >/dev/null && echo "Testes do cadastro: ok")
         terraform plan -input=false -out=plano.tfplan ;;
  aplicar) [ -f plano.tfplan ] || { echo "Rode antes: scripts/infra.sh plano"; exit 1; }
           terraform apply -input=false plano.tfplan && rm -f plano.tfplan && terraform output ;;
  *) echo "Uso: scripts/infra.sh plano | aplicar"; exit 1 ;;
esac
