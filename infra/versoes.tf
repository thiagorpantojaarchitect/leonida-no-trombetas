terraform {
  required_version = ">= 1.5"
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 5.60" }
    archive = { source = "hashicorp/archive", version = "~> 2.4" }
  }
  # Estado remoto: os valores vêm de backend.hcl (criado por scripts/bootstrap-estado.sh).
  backend "s3" {}
}

provider "aws" {
  region              = var.regiao
  allowed_account_ids = [var.conta_aws]
  default_tags { tags = local.tags }
}

# Certificados usados pelo CloudFront precisam ficar em us-east-1.
provider "aws" {
  alias               = "virginia"
  region              = "us-east-1"
  allowed_account_ids = [var.conta_aws]
  default_tags { tags = local.tags }
}

locals {
  tags        = { Projeto = var.projeto, Gerenciado = "terraform", Dono = "diariodeleonida" }
  tem_dominio = var.dominio != ""
  tem_github  = var.github_repo != ""
}

data "aws_caller_identity" "atual" {}
