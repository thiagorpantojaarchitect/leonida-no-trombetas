# O filtro por etiqueta só conta depois de ativar a etiqueta de custo "Projeto" no Billing
# (scripts/ativar-etiqueta-custo.sh; leva até 24 h para aparecer).
# Alerta de custo: avisa por e-mail aos 80% do limite e na previsão de estouro.
resource "aws_budgets_budget" "mensal" {
  name         = "${var.projeto}-mensal"
  budget_type  = "COST"
  limit_amount = tostring(var.orcamento_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  cost_filter {
    name   = "TagKeyValue"
    values = [format("user:Projeto$%s", var.projeto)]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.email_destino]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.email_destino]
  }
}
