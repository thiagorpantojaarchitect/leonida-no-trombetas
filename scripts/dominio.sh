#!/usr/bin/env bash
# Consulta disponibilidade e preço de domínios no Route 53. Só consulta: não compra nada.
# Uso: scripts/dominio.sh thiagopantoja.io leonidanotrombetas.com
source "$(dirname "$0")/comum.sh"; conferir_conta
for d in "$@"; do
  tld="${d#*.}"
  disp="$(aws route53domains check-domain-availability --region us-east-1 --domain-name "$d" --query Availability --output text 2>&1)"
  preco="$(aws route53domains list-prices --region us-east-1 --tld "$tld" --query 'Prices[0].[RegistrationPrice.Price,RenewalPrice.Price,RegistrationPrice.Currency]' --output text 2>&1)"
  echo "$d · $disp · registro/renovação/moeda por ano: $preco"
done
