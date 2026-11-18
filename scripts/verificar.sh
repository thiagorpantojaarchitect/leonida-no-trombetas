#!/usr/bin/env bash
# Confere o que está no ar: página, rota de cadastro (com dado inválido, não grava nada) e e-mail no SES.
source "$(dirname "$0")/comum.sh"; conferir_conta
URL="$(cd "$RAIZ/infra" && terraform output -raw url_jogo)"
echo "Jogo: $URL"
echo "Página:   HTTP $(curl -s -o /dev/null -w '%{http_code}' "$URL/")"
echo "Cadastro: HTTP $(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{}' "$URL/api/cadastro") (esperado 400: recusou dado vazio)"
echo "E-mail no SES: $(aws sesv2 list-email-identities --query 'EmailIdentities[?IdentityType==`EMAIL_ADDRESS`].VerificationStatus' --output text)"
echo "Cadastros na tabela: $(aws dynamodb scan --table-name "$(cd "$RAIZ/infra" && terraform output -raw tabela_cadastros)" --select COUNT --query Count --output text)"
