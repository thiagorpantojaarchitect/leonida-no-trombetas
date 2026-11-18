#!/usr/bin/env bash
# Ativa a etiqueta "Projeto" como etiqueta de custo, para o alerta de orçamento contar só este jogo.
# Só funciona depois que algum recurso com a etiqueta já gerou custo (pode levar 24 h).
source "$(dirname "$0")/comum.sh"; conferir_conta
aws ce update-cost-allocation-tags-status --region us-east-1 --cost-allocation-tags-status TagKey=Projeto,Status=Active
