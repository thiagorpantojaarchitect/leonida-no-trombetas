# Dados pessoais (rascunho para revisão)

Este texto descreve o que o sistema faz. Não é parecer jurídico: revise com quem cuida de LGPD antes de divulgar o jogo.

- **O que é coletado:** nome, sobrenome e telefone, informados pelo próprio jogador, mais data e hora do cadastro e do aceite.
- **Para quê:** contato do organizador (Diário de Leonida) com quem joga.
- **Base:** consentimento, marcado na tela antes do envio.
- **Onde fica:** tabela DynamoDB na AWS (São Paulo), cifrada, e na caixa de e-mail do organizador.
- **Quem vê:** só o organizador. Nenhum jogador vê dados de outro; não há ranking nem lista pública.
- **O que não é coletado:** endereço IP, localização, e-mail do jogador, dados de pagamento.
- **Exclusão:** a pedido do titular, pelo procedimento em `docs/operacao.md`.
- **Menores:** a tela pede que um responsável preencha.
