# Deploy do site pelo GitHub Actions sem chave guardada: o repositório assume um papel por OIDC.
# O papel só publica arquivos do site e limpa o cache. Infraestrutura continua manual.
resource "aws_iam_openid_connect_provider" "github" {
  count           = local.tem_github && var.criar_provedor_oidc ? 1 : 0
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]
}
locals {
  oidc_arn = local.tem_github ? (var.criar_provedor_oidc ? aws_iam_openid_connect_provider.github[0].arn : "arn:aws:iam::${var.conta_aws}:oidc-provider/token.actions.githubusercontent.com") : ""
}
data "aws_iam_policy_document" "github_assume" {
  count = local.tem_github ? 1 : 0
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.oidc_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:ref:refs/heads/main"]
    }
  }
}
resource "aws_iam_role" "github" {
  count              = local.tem_github ? 1 : 0
  name               = "${var.projeto}-github-site"
  assume_role_policy = data.aws_iam_policy_document.github_assume[0].json
}
data "aws_iam_policy_document" "github" {
  count = local.tem_github ? 1 : 0
  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.site.arn]
  }
  statement {
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]
  }
  statement {
    actions   = ["cloudfront:CreateInvalidation"]
    resources = [aws_cloudfront_distribution.site.arn]
  }
}
resource "aws_iam_role_policy" "github" {
  count  = local.tem_github ? 1 : 0
  name   = "publicar-site"
  role   = aws_iam_role.github[0].id
  policy = data.aws_iam_policy_document.github[0].json
}
