variable "projeto" {
  description = "Prefixo dos recursos."
  type        = string
  default     = "leonida-trombetas"
}
variable "conta_aws" {
  description = "Conta AWS onde tudo é criado. O Terraform recusa rodar em outra conta."
  type        = string
  default     = "494110627220"
}
variable "regiao" {
  description = "Região do site, da função e da tabela."
  type        = string
  default     = "sa-east-1"
}
variable "email_destino" {
  description = "E-mail que recebe os cadastros. Fica só em terraform.tfvars (fora do git) e na função."
  type        = string
  sensitive   = true
  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.email_destino))
    error_message = "Informe um e-mail válido."
  }
}
variable "dominio" {
  description = "Domínio próprio já registrado no Route 53 desta conta (ex.: jogo.exemplo.com). Vazio = endereço padrão do CloudFront."
  type        = string
  default     = ""
}
variable "zona_dns" {
  description = "Nome da zona hospedada no Route 53 (ex.: exemplo.com). Obrigatório quando dominio é informado."
  type        = string
  default     = ""
}
variable "orcamento_usd" {
  description = "Limite mensal em dólares para o alerta de custo."
  type        = number
  default     = 10
}
variable "github_repo" {
  description = "Repositório que pode publicar o site pelo GitHub Actions, no formato dono/repo. Vazio = sem deploy automático."
  type        = string
  default     = ""
}
variable "criar_provedor_oidc" {
  description = "Cria o provedor OIDC do GitHub na conta. Use false se a conta já tiver um."
  type        = bool
  default     = true
}
variable "limite_req_por_segundo" {
  description = "Limite de chamadas por segundo na API de cadastro."
  type        = number
  default     = 5
}
