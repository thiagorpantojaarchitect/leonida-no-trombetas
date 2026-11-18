output "url_jogo" {
  description = "Endereço do jogo."
  value       = local.tem_dominio ? "https://${var.dominio}" : "https://${aws_cloudfront_distribution.site.domain_name}"
}
output "bucket_site" { value = aws_s3_bucket.site.id }
output "distribuicao_id" { value = aws_cloudfront_distribution.site.id }
output "tabela_cadastros" { value = aws_dynamodb_table.cadastros.name }
output "papel_github" { value = local.tem_github ? aws_iam_role.github[0].arn : "" }
