# Leonida no Trombetas: Oriximiná

Jogo de fã do @diariodeleonidabr, feito em Three.js, com pré-cadastro de jogadores.
Sem ligação com a Rockstar Games.

## Como está organizado

| Pasta | O que tem |
|---|---|
| `jogo/` | Código do jogo (`src/`), arquivos estáticos (`public/`) e o build |
| `backend/cadastro/` | Função que recebe o pré-cadastro, grava e avisa por e-mail |
| `infra/` | Terraform de tudo que roda na AWS |
| `scripts/` | Comandos do dia a dia (estado, plano, aplicar, publicar, verificar) |
| `.github/workflows/` | Testes automáticos e publicação manual do site |
| `docs/` | Operação e privacidade |

## Arquitetura

```
jogador ──HTTPS──> CloudFront ──┬── /             -> S3 (privado)          jogo
                                └── /api/cadastro -> API HTTP -> Lambda ─┬─> DynamoDB (cadastros)
                                                                         └─> SES (e-mail ao organizador)
```

- Conta AWS `494110627220`, região `sa-east-1`. O Terraform recusa rodar em outra conta.
- O e-mail de destino fica só em `infra/terraform.tfvars` (fora do git) e na função.
- Cada jogador só envia o próprio cadastro. Não existe rota que leia cadastros.

## Primeira subida

```bash
aws login                                   # sua sessão, na conta 494110627220
cp infra/terraform.tfvars.example infra/terraform.tfvars   # preencha o e-mail
scripts/bootstrap-estado.sh                 # uma vez: bucket do estado + terraform init
scripts/infra.sh plano                      # leia o que será criado
scripts/infra.sh aplicar                    # cria a infraestrutura
scripts/publicar-site.sh                    # compila, testa e envia o jogo
scripts/verificar.sh                        # confere página, cadastro e e-mail
```

Depois do `aplicar`, chegam dois e-mails da AWS para confirmar com um clique:
verificação do endereço no SES e inscrição nos alertas (SNS). Sem o primeiro, o aviso de cadastro não sai
(o cadastro fica salvo na tabela mesmo assim).

## Dia a dia

- Mudou o jogo: `scripts/publicar-site.sh`
- Mudou a função ou a infraestrutura: `scripts/infra.sh plano` e `scripts/infra.sh aplicar`
- Testes: `cd jogo && npm test` e `cd backend/cadastro && npm test`

Mais detalhes em `docs/operacao.md`.
