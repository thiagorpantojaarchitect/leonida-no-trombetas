# Site estático: bucket privado, servido só pelo CloudFront.
resource "aws_s3_bucket" "site" {
  bucket = "${var.projeto}-site-${var.conta_aws}"
}
resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
resource "aws_s3_bucket_versioning" "site" {
  bucket = aws_s3_bucket.site.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_lifecycle_configuration" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    id     = "limpa-versoes-antigas"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration { noncurrent_days = 30 }
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${var.projeto}-site"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_cloudfront_cache_policy" "otimizado" { name = "Managed-CachingOptimized" }
data "aws_cloudfront_cache_policy" "sem_cache" { name = "Managed-CachingDisabled" }
data "aws_cloudfront_origin_request_policy" "sem_host" { name = "Managed-AllViewerExceptHostHeader" }
data "aws_cloudfront_response_headers_policy" "seguranca" { name = "Managed-SecurityHeadersPolicy" }

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  comment             = "Leonida no Trombetas: Oriximina"
  default_root_object = "index.html"
  price_class         = "PriceClass_All" # inclui os pontos de presença do Brasil
  http_version        = "http2and3"
  is_ipv6_enabled     = true
  aliases             = local.tem_dominio ? [var.dominio] : []

  origin {
    origin_id                = "site"
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }
  origin {
    origin_id   = "api"
    domain_name = replace(aws_apigatewayv2_api.api.api_endpoint, "https://", "")
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id           = "site"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.otimizado.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.seguranca.id
  }
  # O cadastro usa o mesmo endereço do site: sem CORS e sem expor outro domínio.
  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "api"
    viewer_protocol_policy   = "https-only"
    allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.sem_cache.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.sem_host.id
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }
  viewer_certificate {
    cloudfront_default_certificate = !local.tem_dominio
    acm_certificate_arn            = local.tem_dominio ? aws_acm_certificate_validation.site[0].certificate_arn : null
    ssl_support_method             = local.tem_dominio ? "sni-only" : null
    minimum_protocol_version       = local.tem_dominio ? "TLSv1.2_2021" : "TLSv1"
  }
}

data "aws_iam_policy_document" "site" {
  statement {
    sid       = "SoCloudFront"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }
}
resource "aws_s3_bucket_policy" "site" {
  bucket     = aws_s3_bucket.site.id
  policy     = data.aws_iam_policy_document.site.json
  depends_on = [aws_s3_bucket_public_access_block.site]
}
