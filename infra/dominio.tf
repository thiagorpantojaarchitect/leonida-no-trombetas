# Domínio próprio (opcional). Só entra quando var.dominio é informado,
# depois de o domínio estar registrado no Route 53 desta conta.
data "aws_route53_zone" "site" {
  count = local.tem_dominio ? 1 : 0
  name  = var.zona_dns
}
resource "aws_acm_certificate" "site" {
  count             = local.tem_dominio ? 1 : 0
  provider          = aws.virginia
  domain_name       = var.dominio
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
}
resource "aws_route53_record" "validacao" {
  for_each = local.tem_dominio ? {
    for o in aws_acm_certificate.site[0].domain_validation_options : o.domain_name => o
  } : {}
  zone_id         = data.aws_route53_zone.site[0].zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 60
  allow_overwrite = true
}
resource "aws_acm_certificate_validation" "site" {
  count                   = local.tem_dominio ? 1 : 0
  provider                = aws.virginia
  certificate_arn         = aws_acm_certificate.site[0].arn
  validation_record_fqdns = [for r in aws_route53_record.validacao : r.fqdn]
}
resource "aws_route53_record" "site" {
  for_each = local.tem_dominio ? toset(["A", "AAAA"]) : toset([])
  zone_id  = data.aws_route53_zone.site[0].zone_id
  name     = var.dominio
  type     = each.key
  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}
