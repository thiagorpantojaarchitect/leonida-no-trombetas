# Cadastro: API HTTP -> Lambda -> DynamoDB + e-mail pelo SES.
resource "aws_dynamodb_table" "cadastros" {
  name                        = "${var.projeto}-cadastros"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "telefone"
  deletion_protection_enabled = true
  attribute {
    name = "telefone"
    type = "S"
  }
  point_in_time_recovery { enabled = true }
  server_side_encryption { enabled = true }
}

resource "aws_sesv2_email_identity" "destino" {
  email_identity = var.email_destino
}

data "archive_file" "cadastro" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/cadastro/src"
  output_path = "${path.module}/.build/cadastro.zip"
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}
resource "aws_iam_role" "cadastro" {
  name               = "${var.projeto}-cadastro"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}
data "aws_iam_policy_document" "cadastro" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.cadastro.arn}:*"]
  }
  statement {
    sid       = "Tabela"
    actions   = ["dynamodb:UpdateItem"]
    resources = [aws_dynamodb_table.cadastros.arn]
  }
  statement {
    sid       = "Email"
    actions   = ["ses:SendEmail"]
    resources = [aws_sesv2_email_identity.destino.arn]
  }
}
resource "aws_iam_role_policy" "cadastro" {
  name   = "minimo"
  role   = aws_iam_role.cadastro.id
  policy = data.aws_iam_policy_document.cadastro.json
}
resource "aws_cloudwatch_log_group" "cadastro" {
  name              = "/aws/lambda/${var.projeto}-cadastro"
  retention_in_days = 30
}
resource "aws_lambda_function" "cadastro" {
  function_name    = "${var.projeto}-cadastro"
  role             = aws_iam_role.cadastro.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = data.archive_file.cadastro.output_path
  source_code_hash = data.archive_file.cadastro.output_base64sha256
  timeout          = 10
  memory_size      = 256
  environment {
    variables = {
      TABELA        = aws_dynamodb_table.cadastros.name
      EMAIL_DESTINO = var.email_destino
    }
  }
  depends_on = [aws_cloudwatch_log_group.cadastro, aws_iam_role_policy.cadastro]
}

resource "aws_apigatewayv2_api" "api" {
  name          = "${var.projeto}-api"
  protocol_type = "HTTP"
}
resource "aws_apigatewayv2_integration" "cadastro" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.cadastro.invoke_arn
  payload_format_version = "2.0"
}
resource "aws_apigatewayv2_route" "cadastro" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /api/cadastro"
  target    = "integrations/${aws_apigatewayv2_integration.cadastro.id}"
}
resource "aws_apigatewayv2_stage" "padrao" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
  default_route_settings {
    throttling_rate_limit  = var.limite_req_por_segundo
    throttling_burst_limit = var.limite_req_por_segundo * 2
  }
}
resource "aws_lambda_permission" "api" {
  statement_id  = "ApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cadastro.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

# Alarme: a função de cadastro deu erro.
resource "aws_cloudwatch_metric_alarm" "erros" {
  alarm_name          = "${var.projeto}-cadastro-erros"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.cadastro.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alertas.arn]
}
resource "aws_sns_topic" "alertas" {
  name = "${var.projeto}-alertas"
}
resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alertas.arn
  protocol  = "email"
  endpoint  = var.email_destino
}
