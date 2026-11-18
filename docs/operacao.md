# Operação

## Domínio próprio
1. Consultar preço e disponibilidade (não compra): `scripts/dominio.sh thiagopantoja.io outro.com`
2. Registrar o escolhido no Route 53 (console ou `aws route53domains register-domain`). É uma compra anual: confira o valor antes.
3. Em `infra/terraform.tfvars`, preencher `dominio` e `zona_dns`; depois `scripts/infra.sh plano` e `aplicar`.
   O certificado é criado e validado sozinho. A primeira emissão pode levar alguns minutos.

## Ver os cadastros
- Chegam por e-mail, um por jogador (telefone repetido não gera outro e-mail).
- Tabela: `aws dynamodb scan --table-name leonida-trombetas-cadastros --region sa-east-1`
- Itens com `email_enviado = false` são cadastros cujo aviso falhou (por exemplo, SES ainda não verificado).

## Apagar o cadastro de alguém (pedido do titular)
Use `aws dynamodb delete-item` na tabela `leonida-trombetas-cadastros` (região `sa-east-1`),
com a chave `{"telefone":{"S":"<só os dígitos, com DDD>"}}`.

## Custo
- Alerta por e-mail aos 80% de `orcamento_usd` (padrão: 10 dólares por mês).
- Para o alerta contar só este projeto, rode `scripts/ativar-etiqueta-custo.sh` um dia depois da primeira subida.
- O item que mais pesa é o tráfego do CloudFront: cerca de 28 MB por jogador novo.

## Deploy pelo GitHub (opcional)
1. Em `terraform.tfvars`: `github_repo = "dono/repo"`. Aplicar.
2. No repositório, criar o ambiente `producao` e as variáveis `AWS_PAPEL_SITE`, `BUCKET_SITE` e `DISTRIBUICAO_ID`
   com as saídas de `terraform output`.
3. Publicar em Actions > "Publicar site" > Run workflow. Não há publicação automática.

## Remover a infraestrutura
A tabela tem proteção contra exclusão, de propósito. Para remover tudo: desligue `deletion_protection_enabled`
em `infra/cadastro.tf`, aplique, esvazie o bucket do site e só então use o comando de remoção do Terraform na pasta `infra`.
Faça isso com calma: os cadastros se perdem.
